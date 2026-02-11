import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.js";

describe("HTTP auth", () => {
  afterEach(() => {
    delete process.env.CERBERUS_API_TOKEN;
  });

  it("requires bearer token when CERBERUS_API_TOKEN is set", async () => {
    process.env.CERBERUS_API_TOKEN = "secret-token";
    process.env.ARCH_ESTRA_BASE_URL = "http://localhost:9999";
    process.env.ARCH_ESTRA_API_KEY = "key";
    process.env.ARCH_ESTRA_SECURITY_AGENT_ID = "sec";
    process.env.ARCH_ESTRA_PERFORMANCE_AGENT_ID = "perf";
    process.env.ARCH_ESTRA_COST_AGENT_ID = "cost";

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

    expect(res.statusCode).toBe(401);
  });
});
