import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPolicy } from "../../src/config/loadPolicy.js";

function withTempPolicy(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-policy-"));
  const file = path.join(dir, "policy.yaml");
  fs.writeFileSync(file, contents, "utf8");
  return file;
}

describe("loadPolicy", () => {
  it("loads valid policy", () => {
    const file = withTempPolicy(`weights:\n  security: 0.5\n  performance: 0.3\n  cost: 0.2\nship_threshold: 75\nfail_closed: true\ntimeout_ms_per_agent: 10000\nmax_retries: 2\nblocking_rules:\n  security:\n    severities: [critical]\n  performance:\n    p95_regression_percent: 20\n    p99_regression_percent: 30\n    error_rate_percent: 2\n  cost:\n    monthly_increase_percent: 25\n`);

    const policy = loadPolicy(file);
    expect(policy.ship_threshold).toBe(75);
  });

  it("rejects invalid weights", () => {
    const file = withTempPolicy(`weights:\n  security: 0.9\n  performance: 0.3\n  cost: 0.2\nship_threshold: 75\nfail_closed: true\ntimeout_ms_per_agent: 10000\nmax_retries: 2\nblocking_rules:\n  security:\n    severities: [critical]\n  performance:\n    p95_regression_percent: 20\n    p99_regression_percent: 30\n    error_rate_percent: 2\n  cost:\n    monthly_increase_percent: 25\n`);

    expect(() => loadPolicy(file)).toThrowError(/weights must sum to 1/);
  });
});
