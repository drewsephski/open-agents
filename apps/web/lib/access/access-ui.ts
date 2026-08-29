export type SafeCredentialState =
  | "missing"
  | "pending"
  | "valid"
  | "invalid"
  | "revoked";

export type AllowanceWarning = "none" | "passive" | "prominent" | "exhausted";

export interface AccessSummary {
  eligible: boolean;
  inferenceSource: "byok" | "managed" | null;
  defaultModel: { id: "z-ai/glm-5.3-flash"; label: "GLM 5.3 Flash" };
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
    name: "BYOK",
    price: "$0",
    cadence: "forever",
    description: "Bring an OpenRouter key and pay the provider directly.",
    features: [
      "Your own OpenRouter key",
      "GLM 5.3 Flash by default",
      "2 sandbox hours per UTC month",
      "1 concurrent sandbox",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    cadence: "per month",
    description: "Managed inference for regular cloud coding work.",
    features: [
      "$10 managed inference per billing period",
      "BYOK fallback after managed allowance",
      "GLM 5.3 Flash included",
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
          ? "Managed inference is used up. Add an OpenRouter key or wait for reset."
          : "Sandbox time is used up. Wait for reset or upgrade if available.",
    };
  }
  if (percent >= 90) {
    return {
      warning: "prominent",
      tone: "warning",
      message: `You have used at least 90% of this ${kind} allowance.`,
    };
  }
  if (percent >= 75) {
    return {
      warning: "passive",
      tone: "neutral",
      message: `You have used at least 75% of this ${kind} allowance.`,
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
