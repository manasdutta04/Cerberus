import { describe, expect, it } from "vitest";
import { buildMcpServer } from "../../src/mcp/server.js";

describe("mcp server", () => {
  it("supports initialize and tools/list", async () => {
    delete process.env.MCP_SERVER_TOKEN;
    const app = buildMcpServer();

    const initializeRes = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {}
      }
    });

    expect(initializeRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      }
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json();
    expect(body.result.tools.length).toBe(7);
  });

  it("can call estimate_cost", async () => {
    delete process.env.MCP_SERVER_TOKEN;
    const app = buildMcpServer();

    const callRes = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "estimate_cost",
          arguments: {
            env: "staging"
          }
        }
      }
    });

    expect(callRes.statusCode).toBe(200);
    const body = callRes.json();
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload.details.projected_monthly_usd).toBeDefined();
  });
});
