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
  const inferredUnstructured = !statusMatch;
  const status = inferredUnstructured
    ? "FAIL"
    : statusMatch[1];
  const scoreMatch = upper.match(/\bSCORE\b[^0-9]{0,8}([0-9]{1,3})\b/);
  const scoreRaw = inferredUnstructured
    ? 0
    : scoreMatch
      ? Number(scoreMatch[1])
      : status === "PASS"
        ? 85
        : status === "WARN"
          ? 65
          : 30;
  const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));

  const blocking: string[] = inferredUnstructured || status === "FAIL" ? ["unstructured_agent_failure"] : [];

  return {
    status,
    score,
    summary: inferredUnstructured
      ? "Agent returned unstructured response"
      : compact.slice(0, 220) || "Agent returned unstructured response",
    blocking,
    details: { raw_text: compact.slice(0, 2000), inferred: true, unstructured: inferredUnstructured }
  };
}

function parseVerdictFromTextCandidate(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  const rawText = text.trim();
  if (rawText.length === 0) return null;
  const parsedJson = extractFirstJsonObject(rawText);
  if (parsedJson) return parsedJson;
  return extractVerdictFromText(rawText);
}

function extractVerdictFromUnknown(input: unknown, seen = new Set<unknown>(), depth = 0): Record<string, unknown> | null {
  if (depth > 8 || input === null || input === undefined) {
    return null;
  }
  if (seen.has(input)) {
    return null;
  }
  if (typeof input === "string") {
    return parseVerdictFromTextCandidate(input);
  }
  if (typeof input !== "object") {
    return null;
  }

  seen.add(input);

  if (isVerdictShape(input)) {
    return input as Record<string, unknown>;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const parsed = extractVerdictFromUnknown(item, seen, depth + 1);
      if (parsed) return parsed;
    }
    return null;
  }

  const obj = input as Record<string, unknown>;
  const priorityKeys = [
    "output",
    "result",
    "message",
    "content",
    "parts",
    "data",
    "choices",
    "delta",
    "text",
    "output_text",
    "completion"
  ];

  for (const key of priorityKeys) {
    if (key in obj) {
      const parsed = extractVerdictFromUnknown(obj[key], seen, depth + 1);
      if (parsed) return parsed;
    }
  }

  for (const value of Object.values(obj)) {
    const parsed = extractVerdictFromUnknown(value, seen, depth + 1);
    if (parsed) return parsed;
  }

  return null;
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
      "Rules:",
      "- Use the minimum number of tool calls needed for a verdict.",
      "- Do not ask follow-up questions.",
      "- Do not call archestra__todo_write.",
      "- Do not call archestra__artifact_write.",
      "- If any required check cannot complete quickly, return FAIL JSON immediately with a clear blocking reason.",
      "- Return JSON only. No markdown. No extra text.",
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

    const blocking =
      Array.isArray(output.blocking)
        ? (output.blocking as unknown[]).filter((x): x is string => typeof x === "string")
        : Array.isArray(output.failed_gates)
          ? (output.failed_gates as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined;

    const parsedScore =
      typeof output.score === "number"
        ? output.score
        : typeof output.score === "string" && Number.isFinite(Number(output.score))
          ? Number(output.score)
          : undefined;

    const summary =
      typeof output.summary === "string"
        ? output.summary
        : typeof output.message === "string"
          ? output.message
          : typeof output.reason === "string"
            ? output.reason
            : undefined;

    let status: string | undefined;
    if (typeof output.status === "string") {
      status = output.status;
    } else if (typeof output.state === "string") {
      status = output.state;
    } else if (typeof output.decision === "string") {
      const decision = output.decision.toUpperCase();
      if (decision === "SHIP") status = "PASS";
      if (decision === "NO_SHIP") status = "FAIL";
    }

    if (!status) {
      if (blocking && blocking.length > 0) {
        status = "FAIL";
      } else if (typeof parsedScore === "number") {
        status = parsedScore >= 80 ? "PASS" : parsedScore >= 60 ? "WARN" : "FAIL";
      } else if (typeof summary === "string") {
        const upper = summary.toUpperCase();
        if (upper.includes("FAIL") || upper.includes("ERROR") || upper.includes("BLOCK")) {
          status = "FAIL";
        } else if (upper.includes("WARN") || upper.includes("RISK")) {
          status = "WARN";
        } else if (upper.includes("PASS") || upper.includes("OK") || upper.includes("SUCCESS")) {
          status = "PASS";
        }
      }
    }

    if (typeof status !== "string") {
      throw new ValidationError("Archestra response missing inferable status");
    }

    return {
      status,
      score: parsedScore,
      summary,
      blocking,
      details: typeof output.details === "object" && output.details !== null
        ? (output.details as Record<string, unknown>)
        : output
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
              const messageContent = message?.content;
              const directParts = resultObj?.parts as Array<Record<string, unknown>> | undefined;
              const parts = message?.parts as Array<Record<string, unknown>> | undefined;
              const contentParts = Array.isArray(resultObj?.content)
                ? (resultObj?.content as unknown[]).filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
                : [];
              const messageContentParts = Array.isArray(messageContent)
                ? (messageContent as unknown[]).filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
                : [];
              const mergedParts = [...(parts ?? []), ...(directParts ?? []), ...contentParts, ...messageContentParts];

              let parsedPart: Record<string, unknown> | null = null;
              let hasTextPart = false;
              let hasNonEmptyTextPart = false;

              const parseTextLike = (value: unknown): Record<string, unknown> | null => {
                if (typeof value !== "string") return null;
                hasTextPart = true;
                if (value.trim().length > 0) {
                  hasNonEmptyTextPart = true;
                }
                return parseVerdictFromTextCandidate(value);
              };

              for (const part of mergedParts) {
                // Common A2A and provider wrappers: part.text / part.output_text / part.content
                parsedPart = parseTextLike(part.text) ?? parseTextLike(part.output_text) ?? parseTextLike(part.content);
                if (parsedPart) {
                  break;
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

                // OpenAI-style nested content blocks on a part.
                if (!parsedPart && Array.isArray(part.content)) {
                  for (const chunk of part.content as unknown[]) {
                    if (typeof chunk === "string") {
                      parsedPart = parseTextLike(chunk);
                      if (parsedPart) break;
                      continue;
                    }
                    if (typeof chunk === "object" && chunk !== null) {
                      const block = chunk as Record<string, unknown>;
                      parsedPart = parseTextLike(block.text) ?? parseTextLike(block.output_text) ?? parseTextLike(block.content);
                      if (parsedPart) break;
                    }
                  }
                }
                if (parsedPart) break;
              }

              // Some A2A implementations return output directly under result.
              if (!parsedPart) {
                const resultOutput = resultObj?.output;
                if (isVerdictShape(resultOutput)) {
                  parsedPart = resultOutput as Record<string, unknown>;
                }
              }

              // Some providers return plain text in top-level result fields.
              if (!parsedPart) {
                parsedPart =
                  parseTextLike(resultObj?.text) ??
                  parseTextLike(resultObj?.output_text) ??
                  parseTextLike(resultObj?.completion) ??
                  parseTextLike(resultObj?.content) ??
                  parseTextLike(messageContent);
              }

              if (!parsedPart) {
                parsedPart = extractVerdictFromUnknown(resultObj) ?? extractVerdictFromUnknown(root.result);
              }

              if (!parsedPart && hasTextPart && !hasNonEmptyTextPart) {
                throw new IntegrationError("A2A response contained only empty text output (likely provider quota/rate limit)", {
                  code: "a2a_empty_text",
                  retryable: true
                });
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
