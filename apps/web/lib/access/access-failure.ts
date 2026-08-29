import { z } from "zod";

export const accessFailureCodeSchema = z.enum([
  "access_state_invalid",
  "inference_source_required",
  "byok_credential_invalid",
  "model_requires_byok",
  "subscription_inactive",
  "managed_inference_unavailable",
  "managed_allowance_exhausted",
  "sandbox_allowance_exhausted",
  "sandbox_concurrency_limit_reached",
]);

export type AccessFailureCode = z.infer<typeof accessFailureCodeSchema>;

export const accessRemediationSchema = z.enum([
  "add_byok",
  "manage_byok",
  "upgrade_to_pro",
  "manage_billing",
  "wait_for_reset",
  "stop_sandbox",
  "retry_later",
]);

export type AccessRemediation = z.infer<typeof accessRemediationSchema>;

export const exhaustedAllowanceStateSchema = z.object({
  warning: z.literal("exhausted"),
  period: z.object({ start: z.date(), end: z.date() }),
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});

export type ExhaustedAllowanceState = z.infer<
  typeof exhaustedAllowanceStateSchema
>;

export function exhaustedAllowanceState(params: {
  period: { start: Date; end: Date };
  used: number;
  limit: number;
}): ExhaustedAllowanceState {
  return {
    warning: "exhausted",
    period: params.period,
    used: params.used,
    limit: params.limit,
    remaining: Math.max(0, params.limit - params.used),
  };
}

export function serializeExhaustedAllowanceState(
  state: ExhaustedAllowanceState | undefined,
) {
  return state
    ? {
        ...state,
        period: {
          start: state.period.start.toISOString(),
          end: state.period.end.toISOString(),
        },
      }
    : null;
}

export const accessFailureSchema = z.object({
  code: accessFailureCodeSchema,
  remediation: z.array(accessRemediationSchema),
  resetAt: z.date().optional(),
  allowanceState: exhaustedAllowanceStateSchema.optional(),
});

export type AccessFailure = z.infer<typeof accessFailureSchema>;

export interface AccessDenied {
  allowed: false;
  failure: AccessFailure;
}
