import dotenv from "dotenv";
import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { Logger } from "../observability/logger.js";
import { TOOL_DEFINITIONS, callTool } from "./tools.js";

dotenv.config();

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

function makeError(id: string | number | null, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function makeResult(id: string | number | null, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function isAuthorized(authHeader: string | undefined, token: string | undefined): boolean {
  if (!token) return true;
  if (!authHeader) return false;
  return authHeader.trim() === `Bearer ${token}`;
}

export function buildMcpServer() {
  const logger = new Logger(process.env.MCP_LOG_LEVEL ?? process.env.CERBERUS_LOG_LEVEL ?? "info");
  const app = Fastify({ logger: false });
  const token = process.env.MCP_SERVER_TOKEN;

  app.get("/health", async () => ({ ok: true, service: "cerberus-release-tools" }));

  app.post("/mcp", async (request, reply) => {
    if (!isAuthorized(request.headers.authorization, token)) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const body = request.body as JsonRpcRequest;
    const id = body?.id ?? null;

    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
      return reply.status(400).send(makeError(id, -32600, "Invalid Request"));
    }

    try {
      switch (body.method) {
        case "initialize": {
          return reply.send(
            makeResult(id, {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: { listChanged: false }
              },
              serverInfo: {
                name: "cerberus-release-tools",
                version: "0.1.0"
              }
            })
          );
        }
        case "notifications/initialized": {
          return reply.status(202).send();
        }
        case "tools/list": {
          return reply.send(
            makeResult(id, {
              tools: TOOL_DEFINITIONS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
              }))
            })
          );
        }
        case "tools/call": {
          const params = body.params ?? {};
          const name = params.name;
          const args = params.arguments ?? {};

          if (typeof name !== "string") {
            return reply.status(400).send(makeError(id, -32602, "Invalid params: missing tool name"));
          }

          const result = callTool(name, args);
          return reply.send(makeResult(id, result));
        }
        default:
          return reply.status(404).send(makeError(id, -32601, `Method not found: ${body.method}`));
      }
    } catch (error) {
      logger.error("mcp_tool_error", { method: body.method, error: (error as Error).message });
      return reply.status(500).send(makeError(id, -32000, (error as Error).message));
    }
  });

  return app;
}

async function main(): Promise<void> {
  const port = Number(process.env.MCP_HTTP_PORT ?? "8090");
  const host = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
  const app = buildMcpServer();
  await app.listen({ port, host });
  process.stdout.write(`cerberus-release-tools MCP server running on http://${host}:${port}/mcp\\n`);
}

const isMainModule = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMainModule) {
  void main();
}
