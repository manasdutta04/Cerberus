import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { createDependencies } from "./index.js";
import { evaluateRelease } from "./judge/evaluateRelease.js";
import { EvaluateRequestSchema } from "./types/contracts.js";

export function buildServer(policyPath = "./config/policy.yaml") {
  const deps = createDependencies(policyPath);
  const app = Fastify({ logger: false });

  app.post("/v1/release-gate/evaluate", async (request, reply) => {
    const parse = EvaluateRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        error: "invalid_request",
        details: parse.error.issues.map((issue) => issue.message)
      });
    }

    const result = await evaluateRelease(parse.data, {
      policy: deps.policy,
      client: deps.client,
      logger: deps.logger,
      agentIds: deps.config.agentIds
    });

    if (result.runtimeFailed) {
      return reply.status(503).send(result.decision);
    }

    return reply.status(200).send(result.decision);
  });

  return { app, deps };
}

async function main(): Promise<void> {
  const { app, deps } = buildServer();
  await app.listen({ host: "0.0.0.0", port: deps.config.port });
  deps.logger.info("server_started", { port: deps.config.port });
}

const isMainModule = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMainModule) {
  void main();
}
