import dotenv from "dotenv";
import { loadPolicy } from "./config/loadPolicy.js";
import { ValidationError } from "./errors.js";
import { ArchestraClient } from "./integrations/archestra/client.js";
import { Logger } from "./observability/logger.js";

dotenv.config();

export interface RuntimeConfig {
  baseUrl: string;
  apiKey: string;
  agentIds: {
    security: string;
    performance: string;
    cost: string;
  };
  port: number;
  logLevel: string;
  apiToken?: string;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const required = [
    "ARCH_ESTRA_BASE_URL",
    "ARCH_ESTRA_API_KEY",
    "ARCH_ESTRA_SECURITY_AGENT_ID",
    "ARCH_ESTRA_PERFORMANCE_AGENT_ID",
    "ARCH_ESTRA_COST_AGENT_ID"
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new ValidationError(`missing required env var: ${key}`);
    }
  }

  return {
    baseUrl: process.env.ARCH_ESTRA_BASE_URL as string,
    apiKey: process.env.ARCH_ESTRA_API_KEY as string,
    agentIds: {
      security: process.env.ARCH_ESTRA_SECURITY_AGENT_ID as string,
      performance: process.env.ARCH_ESTRA_PERFORMANCE_AGENT_ID as string,
      cost: process.env.ARCH_ESTRA_COST_AGENT_ID as string
    },
    port: Number(process.env.PORT ?? process.env.CERBERUS_HTTP_PORT ?? "8080"),
    logLevel: process.env.CERBERUS_LOG_LEVEL ?? "info",
    apiToken: process.env.CERBERUS_API_TOKEN
  };
}

export function createDependencies(policyPath: string) {
  const config = loadRuntimeConfig();
  const policy = loadPolicy(policyPath);
  const logger = new Logger(config.logLevel);
  const totalAttempts = policy.max_retries + 1;
  // Treat timeout_ms_per_agent as a per-agent total budget, not per-retry-attempt.
  const timeoutPerAttemptMs = Math.max(1000, Math.floor(policy.timeout_ms_per_agent / totalAttempts));
  const client = new ArchestraClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: timeoutPerAttemptMs
  });

  return {
    config,
    policy,
    logger,
    client
  };
}
