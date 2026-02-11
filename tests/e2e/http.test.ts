import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../src/server.js";

const baseEnv = {
  ARCH_ESTRA_BASE_URL: "http://localhost:9999",
  ARCH_ESTRA_API_KEY: "test-key",
  ARCH_ESTRA_SECURITY_AGENT_ID: "sec",
  ARCH_ESTRA_PERFORMANCE_AGENT_ID: "perf",
  ARCH_ESTRA_COST_AGENT_ID: "cost",
  CERBERUS_LOG_LEVEL: "error"
};

describe("HTTP e2e", () => {
  beforeEach(() => {
    delete process.env.CERBERUS_API_TOKEN;
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 for valid evaluation", async () => {
    const responses = [
      { status: "PASS", score: 90, summary: "ok", blocking: [], details: {} },
      { status: "PASS", score: 85, summary: "ok", blocking: [], details: {} },
      { status: "PASS", score: 80, summary: "ok", blocking: [], details: {} }
    ];

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const { app } = buildServer("./config/policy.yaml");
    const res = await app.inject({
      method: "POST",
      url: "/v1/release-gate/evaluate",
      payload: {
        sha: "abc",
        env: "staging",
        service_url: "https://svc.example"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision).toBe("SHIP");
  });

  it("returns 503 on integration failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const { app } = buildServer("./config/policy.yaml");
    const res = await app.inject({
      method: "POST",
      url: "/v1/release-gate/evaluate",
      payload: {
        sha: "abc",
        env: "staging",
        service_url: "https://svc.example"
      }
    });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.decision).toBe("NO_SHIP");
  });
});
