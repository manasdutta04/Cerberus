import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runCli } from "../../src/cli.js";

const baseEnv = {
  ARCH_ESTRA_BASE_URL: "http://localhost:9999",
  ARCH_ESTRA_API_KEY: "test-key",
  ARCH_ESTRA_SECURITY_AGENT_ID: "sec",
  ARCH_ESTRA_PERFORMANCE_AGENT_ID: "perf",
  ARCH_ESTRA_COST_AGENT_ID: "cost",
  CERBERUS_LOG_LEVEL: "error"
};

const policyPath = "./config/policy.yaml";

describe("CLI e2e", () => {
  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns SHIP with exit code 0", async () => {
    const responses = [
      { status: "PASS", score: 90, summary: "ok", blocking: [], details: {} },
      { status: "PASS", score: 85, summary: "ok", blocking: [], details: {} },
      { status: "PASS", score: 80, summary: "ok", blocking: [], details: {} }
    ];

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const code = await runCli(["run", "--sha", "abc", "--env", "staging", "--service-url", "https://svc.example", "--config", policyPath]);
    expect(code).toBe(0);
  });

  it("returns NO_SHIP with exit code 2", async () => {
    const responses = [
      { status: "FAIL", score: 20, summary: "critical vuln", blocking: ["critical_vuln"], details: {} },
      { status: "PASS", score: 90, summary: "ok", blocking: [], details: {} },
      { status: "PASS", score: 90, summary: "ok", blocking: [], details: {} }
    ];

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const code = await runCli(["run", "--sha", "abc", "--env", "staging", "--service-url", "https://svc.example", "--config", policyPath]);
    expect(code).toBe(2);
  });

  it("fails closed with runtime failure code 3", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const code = await runCli(["run", "--sha", "abc", "--env", "staging", "--service-url", "https://svc.example", "--config", policyPath]);
    expect(code).toBe(3);
  });
});
