#!/usr/bin/env node
import { createDependencies } from "./index.js";
import { evaluateRelease } from "./judge/evaluateRelease.js";
import { EvaluateRequestSchema } from "./types/contracts.js";

interface CliOptions {
  sha: string;
  env: string;
  serviceUrl: string;
  configPath: string;
  containerTag?: string;
  sbomPath?: string;
}

function parseArgs(argv: string[]): CliOptions {
  if (argv[0] !== "run") {
    throw new Error("usage: cerberus run --sha <sha> --env <env> --service-url <url> --config <path>");
  }

  const map = new Map<string, string>();
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid arguments near ${key ?? "<end>"}`);
    }
    map.set(key.slice(2), value);
  }

  const sha = map.get("sha");
  const env = map.get("env");
  const serviceUrl = map.get("service-url");
  const configPath = map.get("config") ?? "./config/policy.yaml";

  if (!sha || !env || !serviceUrl) {
    throw new Error("missing required flags: --sha --env --service-url");
  }

  return {
    sha,
    env,
    serviceUrl,
    configPath,
    containerTag: map.get("container-tag"),
    sbomPath: map.get("sbom-path")
  };
}

export async function runCli(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  const deps = createDependencies(opts.configPath);

  const parsedReq = EvaluateRequestSchema.parse({
    sha: opts.sha,
    env: opts.env,
    service_url: opts.serviceUrl,
    container_tag: opts.containerTag,
    sbom_path: opts.sbomPath
  });

  const result = await evaluateRelease(parsedReq, {
    policy: deps.policy,
    client: deps.client,
    logger: deps.logger,
    agentIds: deps.config.agentIds
  });

  process.stdout.write(`${JSON.stringify(result.decision, null, 2)}\n`);

  if (result.runtimeFailed) {
    return 3;
  }

  return result.decision.decision === "SHIP" ? 0 : 2;
}

async function main(): Promise<void> {
  try {
    const code = await runCli(process.argv.slice(2));
    process.exit(code);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
