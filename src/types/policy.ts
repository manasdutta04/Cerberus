import { z } from "zod";

const WeightSchema = z.number().min(0).max(1);

export const PolicySchema = z
  .object({
    weights: z.object({
      security: WeightSchema,
      performance: WeightSchema,
      cost: WeightSchema
    }),
    ship_threshold: z.number().int().min(0).max(100),
    fail_closed: z.boolean(),
    timeout_ms_per_agent: z.number().int().positive(),
    max_retries: z.number().int().min(0).max(5),
    blocking_rules: z.object({
      security: z.object({
        severities: z.array(z.string()).min(1)
      }),
      performance: z.object({
        p95_regression_percent: z.number().nonnegative(),
        p99_regression_percent: z.number().nonnegative(),
        error_rate_percent: z.number().nonnegative()
      }),
      cost: z.object({
        monthly_increase_percent: z.number().nonnegative()
      })
    })
  })
  .refine((value) => {
    const sum = value.weights.security + value.weights.performance + value.weights.cost;
    return Math.abs(sum - 1) < 0.000001;
  }, { message: "weights must sum to 1" });

export type PolicyConfig = z.infer<typeof PolicySchema>;
