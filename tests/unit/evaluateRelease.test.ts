import { describe, expect, it } from "vitest";
import { scoreVerdicts } from "../../src/judge/evaluateRelease.js";
import type { AgentVerdict } from "../../src/types/contracts.js";
import type { PolicyConfig } from "../../src/types/policy.js";

const policy: PolicyConfig = {
  weights: {
    security: 0.5,
    performance: 0.3,
    cost: 0.2
  },
  ship_threshold: 75,
  fail_closed: true,
  timeout_ms_per_agent: 15000,
  max_retries: 1,
  blocking_rules: {
    security: {
      severities: ["critical", "high"]
    },
    performance: {
      p95_regression_percent: 20,
      p99_regression_percent: 30,
      error_rate_percent: 2
    },
    cost: {
      monthly_increase_percent: 25
    }
  }
};

describe("scoreVerdicts", () => {
  it("computes weighted score correctly", () => {
    const verdicts: AgentVerdict[] = [
      { agent: "security", status: "PASS", score: 80, blocking: [], summary: "ok", details: {} },
      { agent: "performance", status: "PASS", score: 60, blocking: [], summary: "ok", details: {} },
      { agent: "cost", status: "PASS", score: 100, blocking: [], summary: "ok", details: {} }
    ];

    expect(scoreVerdicts(verdicts, policy)).toBe(78);
  });
});
