import { describe, expect, it } from "vitest";
import { AgentVerdictSchema, FinalDecisionSchema } from "../../src/types/contracts.js";

describe("contract schemas", () => {
  it("accepts valid agent verdict", () => {
    const parsed = AgentVerdictSchema.parse({
      agent: "security",
      status: "WARN",
      score: 70,
      blocking: [],
      summary: "Dependency risk detected",
      details: { vuln_count: 1 }
    });

    expect(parsed.agent).toBe("security");
  });

  it("accepts valid final decision", () => {
    const parsed = FinalDecisionSchema.parse({
      decision: "NO_SHIP",
      score: 72,
      failed_gates: ["critical_vuln"],
      next_actions: ["upgrade openssl"],
      inputs: {
        security: "FAIL",
        performance: "PASS",
        cost: "PASS"
      },
      trace_id: "trace-123",
      generated_at: new Date().toISOString()
    });

    expect(parsed.decision).toBe("NO_SHIP");
  });
});
