import { IntegrationError, ValidationError } from "../../errors.js";

export interface ArchestraClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export interface InvokeAgentPayload {
  agentId: string;
  input: Record<string, unknown>;
  traceId: string;
}

export interface InvokeAgentResult {
  status: string;
  score?: number;
  summary?: string;
  blocking?: string[];
  details?: Record<string, unknown>;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class ArchestraClient {
  private readonly cfg: ArchestraClientConfig;

  constructor(cfg: ArchestraClientConfig) {
    this.cfg = cfg;
  }

  async invokeAgent(payload: InvokeAgentPayload): Promise<InvokeAgentResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(`${this.cfg.baseUrl}/v1/agents/${payload.agentId}/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "x-trace-id": payload.traceId
        },
        body: JSON.stringify({
          input: payload.input
        }),
        signal: controller.signal
      });

      const text = await res.text();
      if (!res.ok) {
        throw new IntegrationError(`Archestra invoke failed with status ${res.status}: ${text}`, {
          code: `http_${res.status}`,
          retryable: isTransientStatus(res.status)
        });
      }

      let json: unknown;
      try {
        json = text.length ? JSON.parse(text) : {};
      } catch {
        throw new ValidationError("Archestra response is not valid JSON");
      }

      if (!json || typeof json !== "object") {
        throw new ValidationError("Archestra response must be an object");
      }

      const status = (json as Record<string, unknown>).status;
      if (typeof status !== "string") {
        throw new ValidationError("Archestra response missing string status");
      }

      const result: InvokeAgentResult = {
        status,
        score: typeof (json as Record<string, unknown>).score === "number" ? (json as Record<string, unknown>).score as number : undefined,
        summary: typeof (json as Record<string, unknown>).summary === "string" ? (json as Record<string, unknown>).summary as string : undefined,
        blocking: Array.isArray((json as Record<string, unknown>).blocking)
          ? ((json as Record<string, unknown>).blocking as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        details: typeof (json as Record<string, unknown>).details === "object" && (json as Record<string, unknown>).details !== null
          ? (json as Record<string, unknown>).details as Record<string, unknown>
          : undefined
      };

      return result;
    } catch (error) {
      if (error instanceof IntegrationError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new IntegrationError("Archestra invoke timed out", {
          code: "timeout",
          retryable: true
        });
      }

      throw new IntegrationError(`Archestra network error: ${(error as Error).message}`, {
        code: "network_error",
        retryable: true
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
