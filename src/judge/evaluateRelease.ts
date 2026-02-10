import crypto from "node:crypto";
import { runCostAgent } from "../agents/costAgent.js";
import { runPerformanceAgent } from "../agents/performanceAgent.js";
import { runSecurityAgent } from "../agents/securityAgent.js";
import { IntegrationError, ValidationError } from "../errors.js";
import type { ArchestraClient } from "../integrations/archestra/client.js";
import type { Logger } from "../observability/logger.js";
import { FinalDecisionSchema, type EvaluateRequest, type FinalDecision, type AgentVerdict } from "../types/contracts.js";
import type { PolicyConfig } from "../types/policy.js";

export interface EvaluatorDeps {
  policy: PolicyConfig;
  client: ArchestraClient;
  logger: Logger;
  agentIds: {
    security: string;
    performance: string;
    cost: string;
  };
}

export interface EvaluateResult {
  decision: FinalDecision;
  runtimeFailed: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildFailureDecision(message: string, traceId: string): FinalDecision {
  return {
    decision: "NO_SHIP",
    score: 0,
    failed_gates: ["integration_unavailable"],
    next_actions: [message],
    inputs: {
      security: "FAIL",
      performance: "FAIL",
      cost: "FAIL"
    },
    trace_id: traceId,
    generated_at: nowIso()
  };
}

function hasHardBlock(verdicts: AgentVerdict[]): boolean {
  return verdicts.some((v) => v.status === "FAIL" && v.blocking.length > 0);
}

function collectFailures(verdicts: AgentVerdict[]): string[] {
  const out = new Set<string>();
  for (const v of verdicts) {
    if (v.status === "FAIL") {
      for (const block of v.blocking) {
        out.add(block);
      }
    }
  }
  return Array.from(out);
}

function collectNextActions(verdicts: AgentVerdict[]): string[] {
  const out: string[] = [];
  for (const v of verdicts) {
    if (v.status !== "PASS") {
      out.push(`${v.agent}: ${v.summary}`);
    }
  }
  if (out.length === 0) {
    out.push("No follow-up actions required");
  }
  return out;
}

export function scoreVerdicts(verdicts: AgentVerdict[], policy: PolicyConfig): number {
  const map: Record<"security" | "performance" | "cost", number> = {
    security: 0,
    performance: 0,
    cost: 0
  };

  for (const verdict of verdicts) {
    map[verdict.agent] = verdict.score;
  }

  return roundScore(
    map.security * policy.weights.security +
      map.performance * policy.weights.performance +
      map.cost * policy.weights.cost
  );
}

export async function evaluateRelease(
  request: EvaluateRequest,
  deps: EvaluatorDeps,
  traceId?: string
): Promise<EvaluateResult> {
  const resolvedTraceId = traceId ?? crypto.randomUUID();
  const startedAt = Date.now();
  deps.logger.info("release_evaluation_started", { trace_id: resolvedTraceId, sha: request.sha, env: request.env });

  try {
    const [security, performance, cost] = await Promise.all([
      runSecurityAgent({
        request,
        traceId: resolvedTraceId,
        client: deps.client,
        policy: deps.policy,
        agentId: deps.agentIds.security
      }),
      runPerformanceAgent({
        request,
        traceId: resolvedTraceId,
        client: deps.client,
        policy: deps.policy,
        agentId: deps.agentIds.performance
      }),
      runCostAgent({
        request,
        traceId: resolvedTraceId,
        client: deps.client,
        policy: deps.policy,
        agentId: deps.agentIds.cost
      })
    ]);

    const verdicts = [security, performance, cost] as AgentVerdict[];
    const weightedScore = scoreVerdicts(verdicts, deps.policy);
    const failedGates = collectFailures(verdicts);
    const hardBlock = hasHardBlock(verdicts);
    const thresholdBlock = weightedScore < deps.policy.ship_threshold;

    const decision: FinalDecision = {
      decision: hardBlock || thresholdBlock ? "NO_SHIP" : "SHIP",
      score: weightedScore,
      failed_gates: hardBlock ? failedGates : thresholdBlock ? ["score_below_threshold"] : [],
      next_actions: collectNextActions(verdicts),
      inputs: {
        security: security.status,
        performance: performance.status,
        cost: cost.status
      },
      trace_id: resolvedTraceId,
      generated_at: nowIso()
    };

    const validated = FinalDecisionSchema.parse(decision);
    deps.logger.info("release_evaluation_completed", {
      trace_id: resolvedTraceId,
      duration_ms: Date.now() - startedAt,
      decision: validated.decision,
      score: validated.score
    });

    return { decision: validated, runtimeFailed: false };
  } catch (error) {
    deps.logger.error("release_evaluation_failed", {
      trace_id: resolvedTraceId,
      duration_ms: Date.now() - startedAt,
      error: (error as Error).message
    });

    if (deps.policy.fail_closed && (error instanceof IntegrationError || error instanceof ValidationError)) {
      return {
        decision: buildFailureDecision("Archestra integration unavailable. Retry after restoring connectivity.", resolvedTraceId),
        runtimeFailed: true
      };
    }

    throw error;
  }
}
