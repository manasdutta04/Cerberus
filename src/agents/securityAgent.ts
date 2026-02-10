import type { EvaluateRequest, AgentVerdict } from "../types/contracts.js";
import type { PolicyConfig } from "../types/policy.js";
import type { ArchestraClient } from "../integrations/archestra/client.js";
import { invokeWithRetry } from "../integrations/archestra/invokeAgent.js";

export async function runSecurityAgent(params: {
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
        container_tag: params.request.container_tag,
        sbom_path: params.request.sbom_path,
        blocking_severities: params.policy.blocking_rules.security.severities
      }
    },
    params.policy.max_retries
  );

  return {
    agent: "security",
    status: result.status,
    score: result.score,
    blocking: result.blocking,
    summary: result.summary,
    details: result.details
  };
}
