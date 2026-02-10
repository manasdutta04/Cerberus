import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { PolicyError } from "../errors.js";
import { PolicySchema, type PolicyConfig } from "../types/policy.js";

export function loadPolicy(configPath: string): PolicyConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new PolicyError(`policy file not found at ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const parsedYaml = YAML.parse(raw);
  const parsed = PolicySchema.safeParse(parsedYaml);

  if (!parsed.success) {
    throw new PolicyError(`invalid policy config: ${parsed.error.issues.map((x) => x.message).join("; ")}`);
  }

  return parsed.data;
}
