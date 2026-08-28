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

export const accessFailureSchema = z.object({
  code: accessFailureCodeSchema,
  remediation: z.array(accessRemediationSchema),
  resetAt: z.date().optional(),
});

export type AccessFailure = z.infer<typeof accessFailureSchema>;

export interface AccessDenied {
  allowed: false;
  failure: AccessFailure;
}
