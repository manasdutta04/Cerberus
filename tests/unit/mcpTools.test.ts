import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS, callTool } from "../../src/mcp/tools.js";

function parseToolText(result: ReturnType<typeof callTool>) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("mcp tools", () => {
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

  it("returns deterministic payload with required fields", () => {
    const output = parseToolText(callTool("sast_scan", { sha: "abc123" }));
    expect(typeof output.status).toBe("string");
    expect(typeof output.score).toBe("number");
    expect(Array.isArray(output.blocking)).toBe(true);
  });

  it("returns isError for unknown tool", () => {
    const result = callTool("not_real", {});
    expect(result.isError).toBe(true);
  });
});
