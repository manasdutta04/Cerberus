import { IntegrationError, ValidationError } from "../../errors.js";
import type { ArchestraClient } from "./client.js";

function normalizeStatus(value: string, score: number, blocking: string[]): "PASS" | "WARN" | "FAIL" {
  const upper = value.trim().toUpperCase();
  if (upper === "PASS" || upper === "WARN" || upper === "FAIL") {
    return upper;
  }

  const pass = /\bPASS\b|\bOK\b|\bSUCCESS\b/.test(upper);
  const warn = /\bWARN(?:ING)?\b|\bCAUTION\b/.test(upper);
  const fail = /\bFAIL(?:ED)?\b|\bERROR\b|\bBLOCK(?:ED)?\b|\bNO[_\s-]?SHIP\b/.test(upper);
  const flags = [pass, warn, fail].filter(Boolean).length;

  if (flags === 1) {
    if (fail) return "FAIL";
    if (warn) return "WARN";
    if (pass) return "PASS";
  }

  // Ambiguous status strings (e.g. "PASS|WARN|FAIL"): infer from score/blocking.
  if (blocking.length > 0) {
    return "FAIL";
  }
  if (score >= 80) {
    return "PASS";
  }
  if (score >= 60) {
    return "WARN";
  }
  if (score >= 0) {
    return "FAIL";
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
      const blocking = res.blocking ?? [];

      return {
        status: normalizeStatus(res.status, score, blocking),
        score,
        summary: res.summary ?? "No summary provided",
        blocking,
        details: res.details ?? {}
      };
    } catch (error) {
      lastError = error as Error;

      if (!(error instanceof IntegrationError) || !error.retryable || attempt === maxRetries) {
        throw error;
      }

      // Timeout retries significantly increase tail latency with low recovery odds.
      if (error.code === "timeout") {
        throw error;
      }

      const baseDelay = error.code === "http_429" || error.code === "a2a_empty_text" ? 3000 : 500;
      await sleep(baseDelay * (attempt + 1));
      attempt += 1;
    }
  }

  throw lastError ?? new IntegrationError("Unknown integration failure");
}
