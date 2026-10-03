import {
  accessFailureCodeSchema,
  type AccessFailureCode,
} from "./access-failure";

const messages: Record<AccessFailureCode, string> = {
  access_state_invalid: "Could not check access. Please try again.",
  inference_source_required:
    "Add an OpenRouter API key in Connections or activate Pro before starting a task.",
  byok_credential_invalid:
    "Reconnect your OpenRouter API key in Connections before starting a task.",
  model_requires_byok:
    "This model requires your own OpenRouter API key. Add one in Connections.",
  subscription_inactive:
    "Your Pro subscription is inactive. Check Billing or add an OpenRouter API key.",
  managed_inference_unavailable:
    "Managed inference is unavailable. Check Billing or add an OpenRouter API key.",
  managed_allowance_exhausted:
    "Managed inference is used up. Add an OpenRouter API key or wait for the allowance to reset.",
  sandbox_allowance_exhausted:
    "Sandbox time is used up. Check Billing for your allowance and reset time.",
  sandbox_concurrency_limit_reached:
    "Stop another sandbox before starting this task. Your concurrent sandbox limit has been reached.",
};

export function getAccessFailureMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const parsed = accessFailureCodeSchema.safeParse(error.code);
  return parsed.success ? messages[parsed.data] : null;
}
