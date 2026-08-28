import { describe, expect, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import {
  evaluateAccessPolicy,
  type InferenceAccessRequest,
} from "./access-policy";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-01T00:00:00.000Z");

const activeSubscription = {
  status: "active" as const,
  entitlementState: "active" as const,
  financialState: "paid" as const,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
};

function inferenceRequest(
  overrides: Partial<InferenceAccessRequest> = {},
): InferenceAccessRequest {
  return {
    kind: "inference",
    now: NOW,
    modelId: APP_DEFAULT_MODEL_ID,
    managedModelIds: [APP_DEFAULT_MODEL_ID],
    byokCredentialState: "missing",
    subscription: null,
    managedInference: {
      keyState: "missing",
      spentMicros: 0,
      reservedMicros: 0,
    },
    ...overrides,
  };
}

describe("access policy inference routing", () => {
  test("blocks a first call when the User has no eligible Inference Source", () => {
    expect(evaluateAccessPolicy(inferenceRequest())).toEqual({
      allowed: false,
      failure: {
        code: "inference_source_required",
        remediation: ["add_byok", "upgrade_to_pro"],
      },
    });
  });

  test("selects Managed Inference first for an eligible catalog model", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          byokCredentialState: "valid",
          subscription: activeSubscription,
          managedInference: {
            keyState: "active",
            spentMicros: 2_500_000,
            reservedMicros: 500_000,
          },
        }),
      ),
    ).toEqual({
      allowed: true,
      source: "managed",
      modelId: APP_DEFAULT_MODEL_ID,
      reason: "managed_first",
    });
  });

  test("uses BYOK directly when the User has no Paid-Through Access", () => {
    expect(
      evaluateAccessPolicy(inferenceRequest({ byokCredentialState: "valid" })),
    ).toEqual({
      allowed: true,
      source: "byok",
      modelId: APP_DEFAULT_MODEL_ID,
      reason: "byok_only_access",
    });
  });

  test("uses BYOK directly for a model outside the Managed Model Catalog", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          modelId: "anthropic/claude-sonnet-4.5",
          byokCredentialState: "valid",
          subscription: activeSubscription,
          managedInference: {
            keyState: "active",
            spentMicros: 0,
            reservedMicros: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: true,
      source: "byok",
      modelId: "anthropic/claude-sonnet-4.5",
      reason: "byok_only_model",
    });
  });

  test("falls back to BYOK when the Managed Inference Allowance is exhausted", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          byokCredentialState: "valid",
          subscription: activeSubscription,
          managedInference: {
            keyState: "active",
            spentMicros: 9_750_000,
            reservedMicros: 250_000,
          },
        }),
      ),
    ).toEqual({
      allowed: true,
      source: "byok",
      modelId: APP_DEFAULT_MODEL_ID,
      reason: "managed_fallback",
    });
  });

  test("returns a resumable allowance failure when fallback is unavailable", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          subscription: activeSubscription,
          managedInference: {
            keyState: "active",
            spentMicros: 10_000_000,
            reservedMicros: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "managed_allowance_exhausted",
        remediation: ["add_byok", "wait_for_reset"],
        resetAt: PERIOD_END,
      },
    });
  });

  test("never substitutes a shared key when managed key provisioning fails", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          subscription: activeSubscription,
          managedInference: {
            keyState: "failed",
            spentMicros: 0,
            reservedMicros: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "managed_inference_unavailable",
        remediation: ["add_byok", "retry_later"],
      },
    });
  });

  test("reports invalid BYOK credentials without treating them as access", () => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({ byokCredentialState: "invalid" }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "byok_credential_invalid",
        remediation: ["manage_byok", "upgrade_to_pro"],
      },
    });
  });

  test("scheduled cancellation retains Managed Inference through the period", () => {
    const result = evaluateAccessPolicy(
      inferenceRequest({
        subscription: { ...activeSubscription, cancelAtPeriodEnd: true },
        managedInference: {
          keyState: "active",
          spentMicros: 0,
          reservedMicros: 0,
        },
      }),
    );

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("managed");
    }
  });

  test.each([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ] as const)("does not grant Managed Inference for %s", (status) => {
    expect(
      evaluateAccessPolicy(
        inferenceRequest({
          subscription: { ...activeSubscription, status },
          managedInference: {
            keyState: "active",
            spentMicros: 0,
            reservedMicros: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "subscription_inactive",
        remediation: ["add_byok", "manage_billing"],
      },
    });
  });

  test.each(["fully_refunded", "disputed"] as const)(
    "does not grant Managed Inference when the financial state is %s",
    (financialState) => {
      expect(
        evaluateAccessPolicy(
          inferenceRequest({
            subscription: { ...activeSubscription, financialState },
            managedInference: {
              keyState: "active",
              spentMicros: 0,
              reservedMicros: 0,
            },
          }),
        ),
      ).toEqual({
        allowed: false,
        failure: {
          code: "subscription_inactive",
          remediation: ["add_byok", "manage_billing"],
        },
      });
    },
  );
});
