import { describe, expect, it } from "vitest";
import { IntegrationError } from "../../src/errors.js";
import { evaluateRelease } from "../../src/judge/evaluateRelease.js";
import { Logger } from "../../src/observability/logger.js";
import type { PolicyConfig } from "../../src/types/policy.js";

const policy: PolicyConfig = {
  weights: {
    security: 0.5,
    performance: 0.3,
    cost: 0.2
  },
  ship_threshold: 75,
  fail_closed: true,
  timeout_ms_per_agent: 200,
  max_retries: 0,
  blocking_rules: {
    security: { severities: ["critical"] },
    performance: {
      p95_regression_percent: 20,
      p99_regression_percent: 30,
      error_rate_percent: 2
    },
    cost: { monthly_increase_percent: 25 }
  }
};

function makeClientWithResponses(map: Record<string, unknown>) {
  return {
    invokeAgent: async ({ agentId }: { agentId: string }) => {
      const value = map[agentId];
      if (value instanceof Error) {
        throw value;
      }
      return value as {
        status: string;
        score?: number;
        summary?: string;
        blocking?: string[];
        details?: Record<string, unknown>;
      };
    }
  };
}

describe("evaluateRelease decision logic", () => {
  it("produces NO_SHIP on hard-block FAIL", async () => {
    const client = makeClientWithResponses({
      sec: { status: "FAIL", score: 10, summary: "critical vuln", blocking: ["critical_vuln"], details: {} },
      perf: { status: "PASS", score: 95, summary: "ok", blocking: [], details: {} },
      cost: { status: "PASS", score: 95, summary: "ok", blocking: [], details: {} }
    });

    const result = await evaluateRelease(
      { sha: "abc", env: "staging", service_url: "https://svc.example" },
      {
        policy,
        client: client as never,
        logger: new Logger("error"),
        agentIds: { security: "sec", performance: "perf", cost: "cost" }
      },
      "trace-hard-block"
    );

    expect(result.decision.decision).toBe("NO_SHIP");
    expect(result.decision.failed_gates).toContain("critical_vuln");
  });

  it("fail-closes when integrations are unavailable", async () => {
    const client = makeClientWithResponses({
      sec: new IntegrationError("network down", { retryable: true }),
      perf: new IntegrationError("network down", { retryable: true }),
      cost: new IntegrationError("network down", { retryable: true })
    });

    const result = await evaluateRelease(
      { sha: "abc", env: "staging", service_url: "https://svc.example" },
      {
        policy,
        client: client as never,
        logger: new Logger("error"),
        agentIds: { security: "sec", performance: "perf", cost: "cost" }
      },
      "trace-fail-closed"
    );

    expect(result.runtimeFailed).toBe(true);
    expect(result.decision.decision).toBe("NO_SHIP");
    expect(result.decision.failed_gates).toContain("integration_unavailable");
  });
});
