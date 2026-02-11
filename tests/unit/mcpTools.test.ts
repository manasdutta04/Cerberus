import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS, callTool } from "../../src/mcp/tools.js";

function parseToolText(result: Awaited<ReturnType<typeof callTool>>) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("mcp tools", () => {
  const realToolKeys = [
    "REAL_TOOLS_BEARER_TOKEN",
    "REAL_TOOL_TIMEOUT_MS",
    "REAL_TOOL_SAST_SCAN_URL",
    "REAL_TOOL_DEPENDENCY_SCAN_URL",
    "REAL_TOOL_CONTAINER_SCAN_URL",
    "REAL_TOOL_LOAD_TEST_URL",
    "REAL_TOOL_FETCH_METRICS_URL",
    "REAL_TOOL_ESTIMATE_COST_URL",
    "REAL_TOOL_USAGE_REPORT_URL"
  ];

  beforeEach(() => {
    for (const key of realToolKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of realToolKeys) {
      delete process.env[key];
    }
  });

  it("exposes required 7 tool names", () => {
    const names = TOOL_DEFINITIONS.map((x) => x.name).sort();
    expect(names).toEqual([
      "container_scan",
      "dependency_scan",
      "estimate_cost",
      "fetch_metrics",
      "load_test",
      "sast_scan",
      "usage_report"
    ]);
  });

  it("returns deterministic payload with required fields", async () => {
    const output = parseToolText(await callTool("sast_scan", { sha: "abc123" }));
    expect(typeof output.status).toBe("string");
    expect(typeof output.score).toBe("number");
    expect(Array.isArray(output.blocking)).toBe(true);
  });

  it("returns isError for unknown tool", async () => {
    const result = await callTool("not_real", {});
    expect(result.isError).toBe(true);
  });
});
