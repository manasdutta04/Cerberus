import { z } from "zod";

export const AgentNameSchema = z.enum(["security", "performance", "cost"]);
export const AgentStatusSchema = z.enum(["PASS", "WARN", "FAIL"]);
export const DecisionSchema = z.enum(["SHIP", "NO_SHIP"]);

export const AgentVerdictSchema = z.object({
  agent: AgentNameSchema,
  status: AgentStatusSchema,
  score: z.number().int().min(0).max(100),
  blocking: z.array(z.string()),
  summary: z.string().min(1),
  details: z.record(z.unknown())
});

export const FinalDecisionSchema = z.object({
  decision: DecisionSchema,
  score: z.number().int().min(0).max(100),
  failed_gates: z.array(z.string()),
  next_actions: z.array(z.string()),
  inputs: z.object({
    security: AgentStatusSchema,
    performance: AgentStatusSchema,
    cost: AgentStatusSchema
  }),
  trace_id: z.string().min(1),
  generated_at: z.string().datetime()
});

export const EvaluateRequestSchema = z.object({
  sha: z.string().min(1),
  env: z.string().min(1),
  service_url: z.string().url(),
  container_tag: z.string().min(1).optional(),
  sbom_path: z.string().min(1).optional(),
  release_config: z.record(z.unknown()).optional()
});

export type AgentName = z.infer<typeof AgentNameSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type AgentVerdict = z.infer<typeof AgentVerdictSchema>;
export type FinalDecision = z.infer<typeof FinalDecisionSchema>;
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
