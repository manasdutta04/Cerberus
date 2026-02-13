import { describe, expect, it } from "vitest";
import { invokeWithRetry } from "../../src/integrations/archestra/invokeAgent.js";

function makeClient(response: { status: string; score?: number; summary?: string; blocking?: string[]; details?: Record<string, unknown> }) {
  return {
    invokeAgent: async () => response
  };
}

describe("invokeWithRetry status normalization", () => {
  it("normalizes provider-style status variants", async () => {
    const res = await invokeWithRetry(
      makeClient({ status: "ok", score: 92, blocking: [], summary: "all good", details: {} }) as never,
      { agentId: "a", input: {}, traceId: "t" },
      0
    );
    expect(res.status).toBe("PASS");
  });

  it("handles ambiguous enum-like status using score/blocking", async () => {
    const warn = await invokeWithRetry(
      makeClient({ status: "PASS|WARN|FAIL", score: 68, blocking: [], summary: "mixed", details: {} }) as never,
      { agentId: "a", input: {}, traceId: "t" },
      0
    );
    expect(warn.status).toBe("WARN");

    const fail = await invokeWithRetry(
      makeClient({ status: "PASS|WARN|FAIL", score: 95, blocking: ["critical_issue"], summary: "blocked", details: {} }) as never,
      { agentId: "a", input: {}, traceId: "t" },
      0
    );
    expect(fail.status).toBe("FAIL");
  });
});
