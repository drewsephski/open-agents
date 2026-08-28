import type { AccessDenied } from "./access-failure";
import {
  BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
  BYOK_SANDBOX_CONCURRENCY_LIMIT,
  getUtcCalendarMonthPeriod,
  isWithinAllowancePeriod,
  MANAGED_INFERENCE_ALLOWANCE_MICROS,
  PRO_SANDBOX_ALLOWANCE_MILLISECONDS,
  PRO_SANDBOX_CONCURRENCY_LIMIT,
  type AllowancePeriod,
} from "./allowance-period";
import type {
  CredentialState,
  InferenceSource,
  ManagedKeyState,
} from "./inference-source";
import {
  hasPaidThroughAccess,
  type SubscriptionAccessState,
} from "./subscription-state";

export interface InferenceAccessRequest {
  kind: "inference";
  now: Date;
  modelId: string;
  managedModelIds: readonly string[];
  byokCredentialState: CredentialState;
  subscription: SubscriptionAccessState | null;
  managedInference: {
    keyState: ManagedKeyState;
    period: AllowancePeriod | null;
    spentMicros: number;
    reservedMicros: number;
  };
}

export interface InferenceAccessAllowed {
  allowed: true;
  source: InferenceSource;
  modelId: string;
  reason:
    | "managed_first"
    | "managed_fallback"
    | "byok_only_access"
    | "byok_only_model";
}

export type InferenceAccessDecision = InferenceAccessAllowed | AccessDenied;

export interface SandboxAccessRequest {
  kind: "sandbox";
  operation: "create" | "resume";
  now: Date;
  byokCredentialState: CredentialState;
  subscription: SubscriptionAccessState | null;
  usage: {
    byokPeriodConsumedMilliseconds: number;
    proPeriodConsumedMilliseconds: number;
    runningSandboxCount: number;
  };
}

export interface SandboxAccessAllowed {
  allowed: true;
  tier: "byok" | "pro";
  allowanceMilliseconds: number;
  concurrencyLimit: number;
  period: AllowancePeriod;
}

export type SandboxAccessDecision = SandboxAccessAllowed | AccessDenied;

export type AccessPolicyRequest = InferenceAccessRequest | SandboxAccessRequest;
export type AccessPolicyDecision =
  | InferenceAccessDecision
  | SandboxAccessDecision;

export function evaluateAccessPolicy(
  request: InferenceAccessRequest,
): InferenceAccessDecision;
export function evaluateAccessPolicy(
  request: SandboxAccessRequest,
): SandboxAccessDecision;
export function evaluateAccessPolicy(
  request: AccessPolicyRequest,
): AccessPolicyDecision {
  return request.kind === "inference"
    ? evaluateInferenceAccess(request)
    : evaluateSandboxAccess(request);
}

export function evaluateInferenceAccess(
  request: InferenceAccessRequest,
): InferenceAccessDecision {
  const managedEligible = request.managedModelIds.includes(request.modelId);
  const hasValidByok = request.byokCredentialState === "valid";
  const paidSubscription = hasPaidThroughAccess(
    request.subscription,
    request.now,
  )
    ? request.subscription
    : null;
  const hasPaidThrough = paidSubscription !== null;
  const managedPeriod = request.managedInference.period;
  const hasCurrentManagedPeriod =
    paidSubscription !== null &&
    managedPeriod !== null &&
    managedPeriod.start.getTime() === paidSubscription.periodStart.getTime() &&
    managedPeriod.end.getTime() === paidSubscription.periodEnd.getTime() &&
    isWithinAllowancePeriod(request.now, managedPeriod);
  const hasManagedAllowance =
    request.managedInference.spentMicros >= 0 &&
    request.managedInference.reservedMicros >= 0 &&
    request.managedInference.spentMicros +
      request.managedInference.reservedMicros <
      MANAGED_INFERENCE_ALLOWANCE_MICROS;

  if (
    managedEligible &&
    hasPaidThrough &&
    hasCurrentManagedPeriod &&
    request.managedInference.keyState === "active" &&
    hasManagedAllowance
  ) {
    return {
      allowed: true,
      source: "managed",
      modelId: request.modelId,
      reason: "managed_first",
    };
  }

  if (!managedEligible) {
    if (hasValidByok) {
      return {
        allowed: true,
        source: "byok",
        modelId: request.modelId,
        reason: "byok_only_model",
      };
    }

    return {
      allowed: false,
      failure: {
        code: "model_requires_byok",
        remediation: ["add_byok"],
      },
    };
  }

  if (hasPaidThrough) {
    if (hasValidByok) {
      return {
        allowed: true,
        source: "byok",
        modelId: request.modelId,
        reason: "managed_fallback",
      };
    }

    if (!hasCurrentManagedPeriod) {
      return {
        allowed: false,
        failure: {
          code: "managed_inference_unavailable",
          remediation: ["add_byok", "retry_later"],
        },
      };
    }

    if (!hasManagedAllowance) {
      return {
        allowed: false,
        failure: {
          code: "managed_allowance_exhausted",
          remediation: ["add_byok", "wait_for_reset"],
          resetAt: paidSubscription.periodEnd,
        },
      };
    }

    return {
      allowed: false,
      failure: {
        code: "managed_inference_unavailable",
        remediation: ["add_byok", "retry_later"],
      },
    };
  }

  if (hasValidByok) {
    return {
      allowed: true,
      source: "byok",
      modelId: request.modelId,
      reason: "byok_only_access",
    };
  }

  if (request.subscription) {
    return {
      allowed: false,
      failure: {
        code: "subscription_inactive",
        remediation: ["add_byok", "manage_billing"],
      },
    };
  }

  if (
    request.byokCredentialState === "invalid" ||
    request.byokCredentialState === "revoked"
  ) {
    return {
      allowed: false,
      failure: {
        code: "byok_credential_invalid",
        remediation: ["manage_byok", "upgrade_to_pro"],
      },
    };
  }

  return {
    allowed: false,
    failure: {
      code: "inference_source_required",
      remediation: ["add_byok", "upgrade_to_pro"],
    },
  };
}

export function evaluateSandboxAccess(
  request: SandboxAccessRequest,
): SandboxAccessDecision {
  const paidSubscription = hasPaidThroughAccess(
    request.subscription,
    request.now,
  )
    ? request.subscription
    : null;
  const hasPaidThrough = paidSubscription !== null;
  const hasValidByok = request.byokCredentialState === "valid";

  if (!hasPaidThrough && !hasValidByok) {
    if (
      request.byokCredentialState === "invalid" ||
      request.byokCredentialState === "revoked"
    ) {
      return {
        allowed: false,
        failure: {
          code: "byok_credential_invalid",
          remediation: ["manage_byok", "upgrade_to_pro"],
        },
      };
    }

    return {
      allowed: false,
      failure: {
        code: "inference_source_required",
        remediation: ["add_byok", "upgrade_to_pro"],
      },
    };
  }

  const tier = hasPaidThrough ? "pro" : "byok";
  const allowanceMilliseconds = hasPaidThrough
    ? PRO_SANDBOX_ALLOWANCE_MILLISECONDS
    : BYOK_SANDBOX_ALLOWANCE_MILLISECONDS;
  const concurrencyLimit = hasPaidThrough
    ? PRO_SANDBOX_CONCURRENCY_LIMIT
    : BYOK_SANDBOX_CONCURRENCY_LIMIT;
  const period = hasPaidThrough
    ? {
        start: paidSubscription.periodStart,
        end: paidSubscription.periodEnd,
      }
    : getUtcCalendarMonthPeriod(request.now);
  const consumedMilliseconds = hasPaidThrough
    ? request.usage.proPeriodConsumedMilliseconds
    : request.usage.byokPeriodConsumedMilliseconds;

  if (
    !Number.isSafeInteger(consumedMilliseconds) ||
    consumedMilliseconds < 0 ||
    !Number.isSafeInteger(request.usage.runningSandboxCount) ||
    request.usage.runningSandboxCount < 0
  ) {
    return {
      allowed: false,
      failure: {
        code: "access_state_invalid",
        remediation: ["retry_later"],
      },
    };
  }

  if (consumedMilliseconds >= allowanceMilliseconds) {
    return {
      allowed: false,
      failure: {
        code: "sandbox_allowance_exhausted",
        remediation: hasPaidThrough
          ? ["wait_for_reset"]
          : ["upgrade_to_pro", "wait_for_reset"],
        resetAt: period.end,
      },
    };
  }

  if (request.usage.runningSandboxCount >= concurrencyLimit) {
    return {
      allowed: false,
      failure: {
        code: "sandbox_concurrency_limit_reached",
        remediation: ["stop_sandbox"],
      },
    };
  }

  return {
    allowed: true,
    tier,
    allowanceMilliseconds,
    concurrencyLimit,
    period,
  };
}
