import { IntegrationError, ValidationError } from "../../errors.js";
import type { ArchestraClient } from "./client.js";

function normalizeStatus(value: string): "PASS" | "WARN" | "FAIL" {
  if (value === "PASS" || value === "WARN" || value === "FAIL") {
    return value;
  }
  throw new ValidationError(`invalid agent status: ${value}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invokeWithRetry(
  client: ArchestraClient,
  payload: { agentId: string; input: Record<string, unknown>; traceId: string },
  maxRetries: number
): Promise<{ status: "PASS" | "WARN" | "FAIL"; score: number; summary: string; blocking: string[]; details: Record<string, unknown> }> {
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= maxRetries) {
    try {
      const res = await client.invokeAgent(payload);
      const score = typeof res.score === "number" ? Math.max(0, Math.min(100, Math.round(res.score))) : 50;

      return {
        status: normalizeStatus(res.status),
        score,
        summary: res.summary ?? "No summary provided",
        blocking: res.blocking ?? [],
        details: res.details ?? {}
      };
    } catch (error) {
      lastError = error as Error;

      if (!(error instanceof IntegrationError) || !error.retryable || attempt === maxRetries) {
        throw error;
      }

      await sleep(200 * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError ?? new IntegrationError("Unknown integration failure");
}
