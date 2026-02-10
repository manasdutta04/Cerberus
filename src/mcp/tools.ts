import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const SastScanInput = z.object({
  sha: z.string().min(1),
  repo: z.string().optional(),
  branch: z.string().optional()
});

const DependencyScanInput = z.object({
  sha: z.string().min(1),
  sbom_path: z.string().optional(),
  lockfile: z.string().optional()
});

const ContainerScanInput = z.object({
  container_tag: z.string().min(1)
});

const LoadTestInput = z.object({
  service_url: z.string().url(),
  duration_seconds: z.number().int().positive().max(300).optional(),
  concurrency: z.number().int().positive().max(500).optional()
});

const FetchMetricsInput = z.object({
  service_url: z.string().url(),
  window_minutes: z.number().int().positive().max(180).optional()
});

const EstimateCostInput = z.object({
  env: z.string().min(1),
  release_config: z.record(z.unknown()).optional()
});

const UsageReportInput = z.object({
  env: z.string().min(1),
  period_days: z.number().int().positive().max(90).optional()
});

const SastScanInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    sha: { type: "string" },
    repo: { type: "string" },
    branch: { type: "string" }
  },
  required: ["sha"],
  additionalProperties: false
};

const DependencyScanInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    sha: { type: "string" },
    sbom_path: { type: "string" },
    lockfile: { type: "string" }
  },
  required: ["sha"],
  additionalProperties: false
};

const ContainerScanInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    container_tag: { type: "string" }
  },
  required: ["container_tag"],
  additionalProperties: false
};

const LoadTestInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    service_url: { type: "string" },
    duration_seconds: { type: "number" },
    concurrency: { type: "number" }
  },
  required: ["service_url"],
  additionalProperties: false
};

const FetchMetricsInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    service_url: { type: "string" },
    window_minutes: { type: "number" }
  },
  required: ["service_url"],
  additionalProperties: false
};

const EstimateCostInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    env: { type: "string" },
    release_config: { type: "object" }
  },
  required: ["env"],
  additionalProperties: true
};

const UsageReportInputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    env: { type: "string" },
    period_days: { type: "number" }
  },
  required: ["env"],
  additionalProperties: false
};

function seededNumber(seed: string, min: number, max: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const normalized = Math.abs(hash % 10000) / 10000;
  return min + (max - min) * normalized;
}

function statusFromScore(score: number): "PASS" | "WARN" | "FAIL" {
  if (score >= 80) return "PASS";
  if (score >= 60) return "WARN";
  return "FAIL";
}

function asTextResult(payload: Record<string, unknown>): ToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "sast_scan",
    description: "Run static analysis checks and return vulnerability severity counts.",
    inputSchema: SastScanInputSchema
  },
  {
    name: "dependency_scan",
    description: "Analyze dependencies/SBOM for known vulnerabilities.",
    inputSchema: DependencyScanInputSchema
  },
  {
    name: "container_scan",
    description: "Scan container image for critical/high CVEs.",
    inputSchema: ContainerScanInputSchema
  },
  {
    name: "load_test",
    description: "Execute smoke load test and return p95/p99 latency and error rate.",
    inputSchema: LoadTestInputSchema
  },
  {
    name: "fetch_metrics",
    description: "Fetch latency/error metrics for release candidate baseline comparison.",
    inputSchema: FetchMetricsInputSchema
  },
  {
    name: "estimate_cost",
    description: "Estimate projected monthly runtime/token/cloud costs for release.",
    inputSchema: EstimateCostInputSchema
  },
  {
    name: "usage_report",
    description: "Generate recent usage report for cost trend and delta analysis.",
    inputSchema: UsageReportInputSchema
  }
];

export function callTool(name: string, args: unknown): ToolCallResult {
  switch (name) {
    case "sast_scan": {
      const input = SastScanInput.parse(args);
      const critical = Math.round(seededNumber(`${input.sha}:sast:critical`, 0, 2));
      const high = Math.round(seededNumber(`${input.sha}:sast:high`, 0, 5));
      const score = Math.max(0, 100 - critical * 40 - high * 10);
      return asTextResult({
        status: statusFromScore(score),
        score,
        summary: critical > 0 ? "Critical issues found in static analysis" : "SAST checks clean",
        blocking: critical > 0 ? ["critical_sast_vulnerability"] : [],
        details: { critical, high, medium: Math.round(seededNumber(`${input.sha}:sast:medium`, 1, 10)) }
      });
    }
    case "dependency_scan": {
      const input = DependencyScanInput.parse(args);
      const critical = Math.round(seededNumber(`${input.sha}:dep:critical`, 0, 1));
      const high = Math.round(seededNumber(`${input.sha}:dep:high`, 0, 4));
      const score = Math.max(0, 100 - critical * 45 - high * 12);
      return asTextResult({
        status: statusFromScore(score),
        score,
        summary: critical > 0 ? "Critical dependency CVEs detected" : "Dependency scan completed",
        blocking: critical > 0 ? ["critical_dependency_vulnerability"] : [],
        details: { critical, high, package_count: Math.round(seededNumber(`${input.sha}:dep:pkg`, 50, 400)) }
      });
    }
    case "container_scan": {
      const input = ContainerScanInput.parse(args);
      const critical = Math.round(seededNumber(`${input.container_tag}:container:critical`, 0, 1));
      const high = Math.round(seededNumber(`${input.container_tag}:container:high`, 0, 3));
      const score = Math.max(0, 100 - critical * 50 - high * 10);
      return asTextResult({
        status: statusFromScore(score),
        score,
        summary: critical > 0 ? "Container image has critical CVEs" : "Container scan completed",
        blocking: critical > 0 ? ["critical_container_vulnerability"] : [],
        details: { critical, high, image: input.container_tag }
      });
    }
    case "load_test": {
      const input = LoadTestInput.parse(args);
      const p95 = Math.round(seededNumber(`${input.service_url}:p95`, 90, 380));
      const p99 = Math.round(seededNumber(`${input.service_url}:p99`, 120, 520));
      const errorRate = Number(seededNumber(`${input.service_url}:err`, 0.05, 3.0).toFixed(2));
      const score = Math.max(0, 100 - Math.max(0, p95 - 180) * 0.15 - errorRate * 12);
      return asTextResult({
        status: statusFromScore(score),
        score: Math.round(score),
        summary: score < 60 ? "Performance regression under load" : "Load test within acceptable range",
        blocking: score < 60 ? ["p95_latency_regression"] : [],
        details: { p95_ms: p95, p99_ms: p99, error_rate_percent: errorRate }
      });
    }
    case "fetch_metrics": {
      const input = FetchMetricsInput.parse(args);
      const p95Delta = Number(seededNumber(`${input.service_url}:p95delta`, -8, 35).toFixed(2));
      const p99Delta = Number(seededNumber(`${input.service_url}:p99delta`, -6, 45).toFixed(2));
      const errorDelta = Number(seededNumber(`${input.service_url}:errdelta`, -0.4, 2.5).toFixed(2));
      const score = Math.max(0, 100 - Math.max(0, p95Delta) * 1.2 - Math.max(0, errorDelta) * 20);
      return asTextResult({
        status: statusFromScore(score),
        score: Math.round(score),
        summary: score < 60 ? "Production metrics indicate potential SLO breach" : "Metrics trend acceptable",
        blocking: score < 60 ? ["error_budget_risk"] : [],
        details: {
          p95_delta_percent: p95Delta,
          p99_delta_percent: p99Delta,
          error_rate_delta_percent: errorDelta
        }
      });
    }
    case "estimate_cost": {
      const input = EstimateCostInput.parse(args);
      const monthly = Number(seededNumber(`${input.env}:cost:monthly`, 220, 1800).toFixed(2));
      const delta = Number(seededNumber(`${input.env}:cost:delta`, -10, 38).toFixed(2));
      const score = Math.max(0, 100 - Math.max(0, delta - 10) * 2.5);
      return asTextResult({
        status: statusFromScore(score),
        score: Math.round(score),
        summary: score < 60 ? "Projected cost increase exceeds policy comfort" : "Projected costs acceptable",
        blocking: score < 60 ? ["monthly_cost_regression"] : [],
        details: {
          projected_monthly_usd: monthly,
          delta_percent: delta
        }
      });
    }
    case "usage_report": {
      const input = UsageReportInput.parse(args);
      const tokens = Math.round(seededNumber(`${input.env}:usage:tokens`, 100000, 3000000));
      const runtime = Number(seededNumber(`${input.env}:usage:runtime`, 100, 1200).toFixed(2));
      const score = Math.max(0, 100 - runtime / 30);
      return asTextResult({
        status: statusFromScore(score),
        score: Math.round(score),
        summary: "Usage report generated",
        blocking: [],
        details: {
          period_days: input.period_days ?? 30,
          total_tokens: tokens,
          runtime_hours: runtime
        }
      });
    }
    default:
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }]
      };
  }
}
