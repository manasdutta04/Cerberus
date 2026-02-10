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

function extractFirstJsonObject(input: string): Record<string, unknown> | null {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(input.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isVerdictShape(input: unknown): input is Record<string, unknown> {
  return Boolean(
    input &&
      typeof input === "object" &&
      typeof (input as Record<string, unknown>).status === "string"
  );
}

function extractVerdictFromText(text: string): Record<string, unknown> {
  const compact = text.replace(/\s+/g, " ").trim();
  const upper = compact.toUpperCase();
  const statusMatch = upper.match(/\b(PASS|WARN|FAIL)\b/);
  const status = statusMatch ? statusMatch[1] : (upper.includes("FAIL") || upper.includes("ERROR") ? "FAIL" : "WARN");
  const scoreMatch = upper.match(/\bSCORE\b[^0-9]{0,8}([0-9]{1,3})\b/);
  const scoreRaw = scoreMatch ? Number(scoreMatch[1]) : status === "PASS" ? 85 : status === "WARN" ? 65 : 30;
  const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));

  const blocking: string[] = [];
  if (status === "FAIL") {
    blocking.push("unstructured_agent_failure");
  }

  return {
    status,
    score,
    summary: compact.slice(0, 220) || "Agent returned unstructured response",
    blocking,
    details: { raw_text: compact.slice(0, 2000), inferred: true }
  };
}

export class ArchestraClient {
  private readonly cfg: ArchestraClientConfig;

  constructor(cfg: ArchestraClientConfig) {
    this.cfg = cfg;
  }

  private async callHttpInvoke(url: string, payload: InvokeAgentPayload, signal: AbortSignal): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "x-trace-id": payload.traceId
      },
      body: JSON.stringify({
        input: payload.input
      }),
      signal
    });
  }

  private async callA2A(url: string, payload: InvokeAgentPayload, signal: AbortSignal): Promise<Response> {
    const prompt = [
      "Evaluate this release input and return ONLY valid JSON with fields:",
      "{",
      '  "status": "PASS|WARN|FAIL",',
      '  "score": number(0-100),',
      '  "summary": "string",',
      '  "blocking": ["string"],',
      '  "details": { "any": "object" }',
      "}",
      `Input: ${JSON.stringify(payload.input)}`
    ].join("\n");

    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "x-trace-id": payload.traceId
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: {
          message: {
            parts: [{ kind: "text", text: prompt }]
          }
        }
      }),
      signal
    });
  }

  private parseAgentOutput(json: unknown): InvokeAgentResult {
    if (!json || typeof json !== "object") {
      throw new ValidationError("Archestra response must be an object");
    }

    const root = json as Record<string, unknown>;
    const output = typeof root.output === "object" && root.output !== null
      ? (root.output as Record<string, unknown>)
      : root;

    const status = output.status;
    if (typeof status !== "string") {
      throw new ValidationError("Archestra response missing string status");
    }

    return {
      status,
      score: typeof output.score === "number" ? output.score : undefined,
      summary: typeof output.summary === "string" ? output.summary : undefined,
      blocking: Array.isArray(output.blocking)
        ? (output.blocking as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
      details: typeof output.details === "object" && output.details !== null
        ? (output.details as Record<string, unknown>)
        : undefined
    };
  }

  async invokeAgent(payload: InvokeAgentPayload): Promise<InvokeAgentResult> {
    const candidates = [
      `${this.cfg.baseUrl}/v1/a2a/${payload.agentId}`,
      `${this.cfg.baseUrl}/v1/agents/${payload.agentId}/invoke`
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      let lastHttpError: IntegrationError | undefined;
      let text = "";
      let json: unknown;

      for (const url of candidates) {
        const isA2A = url.includes("/v1/a2a/");
        const res = isA2A
          ? await this.callA2A(url, payload, controller.signal)
          : await this.callHttpInvoke(url, payload, controller.signal);

        text = await res.text();
        if (!res.ok) {
          const err = new IntegrationError(`Archestra invoke failed with status ${res.status}: ${text}`, {
            code: `http_${res.status}`,
            retryable: isTransientStatus(res.status)
          });
          // Try next route candidate on common compatibility/auth mismatches.
          if ((res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405) && url !== candidates[candidates.length - 1]) {
            lastHttpError = err;
            continue;
          }
          throw err;
        }

        try {
          json = text.length ? JSON.parse(text) : {};
        } catch {
          throw new ValidationError("Archestra response is not valid JSON");
        }

        if (isA2A) {
          const root = json as Record<string, unknown>;
          // Support both native A2A message wrapper and direct JSON verdict responses.
          if (typeof root.status !== "string") {
            if (isVerdictShape(root.result)) {
              json = root.result;
            } else {
              const resultObj =
                typeof root.result === "object" && root.result !== null
                  ? (root.result as Record<string, unknown>)
                  : undefined;
              const message = resultObj?.message as Record<string, unknown> | undefined;
              const directParts = resultObj?.parts as Array<Record<string, unknown>> | undefined;
              const parts = message?.parts as Array<Record<string, unknown>> | undefined;
              const mergedParts = [...(parts ?? []), ...(directParts ?? [])];

              let parsedPart: Record<string, unknown> | null = null;
              for (const part of mergedParts) {
                if ((part.kind === "text" || part.type === "text") && typeof part.text === "string") {
                  parsedPart = extractFirstJsonObject(part.text);
                  if (!parsedPart) {
                    parsedPart = extractVerdictFromText(part.text);
                  }
                  if (parsedPart) break;
                }
                if (part.kind === "data" || part.type === "data" || (typeof part.data === "object" && part.data !== null)) {
                  if (isVerdictShape(part.data)) {
                    parsedPart = part.data as Record<string, unknown>;
                    break;
                  }
                  if (typeof part.data === "object" && part.data !== null) {
                    const maybeOutput = (part.data as Record<string, unknown>).output;
                    if (isVerdictShape(maybeOutput)) {
                      parsedPart = maybeOutput;
                      break;
                    }
                  }
                }
              }

              // Some A2A implementations return output directly under result.
              if (!parsedPart) {
                const resultOutput = resultObj?.output;
                if (isVerdictShape(resultOutput)) {
                  parsedPart = resultOutput as Record<string, unknown>;
                }
              }

              if (!parsedPart) {
                throw new ValidationError("A2A response missing parseable verdict content");
              }
              json = parsedPart;
            }
          }
        }

        lastHttpError = undefined;
        break;
      }

      if (lastHttpError) {
        throw lastHttpError;
      }
      return this.parseAgentOutput(json);
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
