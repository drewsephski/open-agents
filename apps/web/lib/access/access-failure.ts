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

export const allowanceStateSchema = z.object({
  warning: z.enum(["none", "passive", "prominent", "exhausted"]),
  period: z.object({ start: z.date(), end: z.date() }),
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});

export type AllowanceState = z.infer<typeof allowanceStateSchema>;

export function allowanceState(params: {
  warning: AllowanceState["warning"];
  period: { start: Date; end: Date };
  used: number;
  limit: number;
}): AllowanceState {
  return {
    ...params,
    remaining: Math.max(0, params.limit - params.used),
  };
}

export function exhaustedAllowanceState(params: {
  period: { start: Date; end: Date };
  used: number;
  limit: number;
}): AllowanceState {
  return allowanceState({ ...params, warning: "exhausted" });
}

export function serializeAllowanceState(state: AllowanceState | undefined) {
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
  allowanceState: allowanceStateSchema.optional(),
});

export type AccessFailure = z.infer<typeof accessFailureSchema>;

export interface AccessDenied {
  allowed: false;
  failure: AccessFailure;
}
