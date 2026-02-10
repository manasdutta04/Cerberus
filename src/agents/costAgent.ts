import type { EvaluateRequest, AgentVerdict } from "../types/contracts.js";
import type { PolicyConfig } from "../types/policy.js";
import type { ArchestraClient } from "../integrations/archestra/client.js";
import { invokeWithRetry } from "../integrations/archestra/invokeAgent.js";

export async function runCostAgent(params: {
  request: EvaluateRequest;
  traceId: string;
  client: ArchestraClient;
  policy: PolicyConfig;
  agentId: string;
}): Promise<AgentVerdict> {
  const result = await invokeWithRetry(
    params.client,
    {
      agentId: params.agentId,
      traceId: params.traceId,
      input: {
        sha: params.request.sha,
        env: params.request.env,
        release_config: params.request.release_config,
        monthly_increase_percent_threshold: params.policy.blocking_rules.cost.monthly_increase_percent
      }
    },
    params.policy.max_retries
  );

  return {
    agent: "cost",
    status: result.status,
    score: result.score,
    blocking: result.blocking,
    summary: result.summary,
    details: result.details
  };
}
