export type SafeCredentialState =
  | "missing"
  | "pending"
  | "valid"
  | "invalid"
  | "revoked";

export type AllowanceWarning = "none" | "passive" | "prominent" | "exhausted";

export interface AccessSummary {
  eligible: boolean;
  inferenceSource: "byok" | "managed" | "codex" | null;
  codex?: { connected: boolean };
  defaultModel: { id: string; label: string };
  credential: {
    state: SafeCredentialState;
    label: string | null;
    lastFour: string | null;
    validatedAt: string | null;
  };
  plan: {
    id: "byok" | "pro";
    status: string | null;
    cancelAtPeriodEnd: boolean;
    periodStart: string;
    periodEnd: string;
    portalAvailable: boolean;
  };
  managedInference: {
    usedMicros: number;
    limitMicros: number;
    remainingMicros: number;
    warning: AllowanceWarning;
    resetAt: string | null;
  };
  sandbox: {
    tier: "byok" | "pro";
    usedMilliseconds: number;
    limitMilliseconds: number;
    remainingMilliseconds: number;
    runningSandboxCount: number;
    concurrencyLimit: number;
    warning: AllowanceWarning;
    resetAt: string;
  };
}

export const PRICING_PLANS = [
  {
    id: "byok",
    name: "Free",
    price: "$0",
    cadence: "forever",
    description:
      "Use your Codex subscription or bring an OpenRouter key. No Launchstack subscription required.",
    features: [
      "Your existing Codex subscription",
      "Your own OpenRouter key",
      "Application default model",
      "2 sandbox hours per UTC month",
      "1 concurrent sandbox",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    cadence: "per month",
    description:
      "Choose Pro when you want Launchstack to manage your AI usage.",
    features: [
      "AI usage included each month",
      "Continue with your own OpenRouter key after included usage",
      "Application default model included",
      "25 sandbox hours per billing period",
      "2 concurrent sandboxes",
    ],
  },
] as const;

export function isInferenceEligible(input: {
  byokState: SafeCredentialState;
  hasManagedAccess: boolean;
}): boolean {
  return input.byokState === "valid" || input.hasManagedAccess;
}

export function getAllowancePresentation(
  percent: number,
  kind: "inference" | "sandbox",
): {
  warning: AllowanceWarning;
  tone: "neutral" | "warning" | "action";
  message: string;
} {
  if (percent >= 100) {
    return {
      warning: "exhausted",
      tone: "action",
      message:
        kind === "inference"
          ? "Included AI usage is used up. Use your OpenRouter key or wait for renewal."
          : "Cloud workspace time is used up. Wait for renewal or upgrade your plan.",
    };
  }
  if (percent >= 90) {
    return {
      warning: "prominent",
      tone: "warning",
      message: `You have used at least 90% of your ${kind === "inference" ? "included AI usage" : "cloud workspace time"}.`,
    };
  }
  if (percent >= 75) {
    return {
      warning: "passive",
      tone: "neutral",
      message: `You have used at least 75% of your ${kind === "inference" ? "included AI usage" : "cloud workspace time"}.`,
    };
  }
  return {
    warning: "none",
    tone: "neutral",
    message: "",
  };
}

export function getAllowancePercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}
