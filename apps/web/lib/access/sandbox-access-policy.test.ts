import { describe, expect, test } from "bun:test";
import {
  BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
  PRO_SANDBOX_ALLOWANCE_MILLISECONDS,
} from "./allowance-period";
import {
  evaluateAccessPolicy,
  type SandboxAccessRequest,
} from "./access-policy";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const PERIOD_START = new Date("2026-08-10T00:00:00.000Z");
const PERIOD_END = new Date("2026-09-10T00:00:00.000Z");

const activeSubscription = {
  status: "active" as const,
  entitlementState: "active" as const,
  financialState: "paid" as const,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  cancelAtPeriodEnd: false,
};

function sandboxRequest(
  overrides: Partial<SandboxAccessRequest> = {},
): SandboxAccessRequest {
  return {
    kind: "sandbox",
    operation: "create",
    now: NOW,
    byokCredentialState: "valid",
    subscription: null,
    usage: {
      byokPeriodConsumedMilliseconds: 0,
      proPeriodConsumedMilliseconds: 0,
      runningSandboxCount: 0,
    },
    ...overrides,
  };
}

describe("access policy sandbox admission", () => {
  test("admits a connected Codex User on the free tier without native credentials or Pro", () => {
    const decision = evaluateAccessPolicy(
      sandboxRequest({
        byokCredentialState: "missing",
        codexConnected: true,
        subscription: null,
      }),
    );
    expect(decision).toMatchObject({
      allowed: true,
      tier: "byok",
      concurrencyLimit: 1,
      allowanceMilliseconds: BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
    });
    expect(
      evaluateAccessPolicy(
        sandboxRequest({
          byokCredentialState: "missing",
          codexConnected: false,
          subscription: null,
        }),
      ).allowed,
    ).toBe(false);
  });

  test("grants BYOK two UTC-calendar-month hours and one concurrent sandbox", () => {
    expect(evaluateAccessPolicy(sandboxRequest())).toEqual({
      allowed: true,
      tier: "byok",
      allowanceMilliseconds: BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
      concurrencyLimit: 1,
      period: {
        start: new Date("2026-08-01T00:00:00.000Z"),
        end: new Date("2026-09-01T00:00:00.000Z"),
      },
    });
  });

  test("grants Pro a fresh paid-period allowance after a mid-month upgrade", () => {
    expect(
      evaluateAccessPolicy(
        sandboxRequest({
          byokCredentialState: "missing",
          subscription: activeSubscription,
          usage: {
            byokPeriodConsumedMilliseconds: BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
            proPeriodConsumedMilliseconds: 0,
            runningSandboxCount: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: true,
      tier: "pro",
      allowanceMilliseconds: PRO_SANDBOX_ALLOWANCE_MILLISECONDS,
      concurrencyLimit: 2,
      period: { start: PERIOD_START, end: PERIOD_END },
    });
  });

  test.each(["create", "resume"] as const)(
    "blocks sandbox %s at the allowance boundary with the reset date",
    (operation) => {
      expect(
        evaluateAccessPolicy(
          sandboxRequest({
            operation,
            usage: {
              byokPeriodConsumedMilliseconds:
                BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
              proPeriodConsumedMilliseconds: 0,
              runningSandboxCount: 0,
            },
          }),
        ),
      ).toEqual({
        allowed: false,
        failure: {
          code: "sandbox_allowance_exhausted",
          remediation: ["upgrade_to_pro", "wait_for_reset"],
          resetAt: new Date("2026-09-01T00:00:00.000Z"),
          allowanceState: {
            warning: "exhausted",
            period: {
              start: new Date("2026-08-01T00:00:00.000Z"),
              end: new Date("2026-09-01T00:00:00.000Z"),
            },
            used: BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
            limit: BYOK_SANDBOX_ALLOWANCE_MILLISECONDS,
            remaining: 0,
          },
        },
      });
    },
  );

  test("blocks BYOK at one concurrent Running Sandbox", () => {
    expect(
      evaluateAccessPolicy(
        sandboxRequest({
          usage: {
            byokPeriodConsumedMilliseconds: 0,
            proPeriodConsumedMilliseconds: 0,
            runningSandboxCount: 1,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_concurrency_limit_reached",
        remediation: ["stop_sandbox"],
      },
    });
  });

  test("blocks Pro at two concurrent Running Sandboxes", () => {
    expect(
      evaluateAccessPolicy(
        sandboxRequest({
          subscription: activeSubscription,
          usage: {
            byokPeriodConsumedMilliseconds: 0,
            proPeriodConsumedMilliseconds: 0,
            runningSandboxCount: 2,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_concurrency_limit_reached",
        remediation: ["stop_sandbox"],
      },
    });
  });

  test("requires BYOK or Paid-Through Access before provisioning", () => {
    expect(
      evaluateAccessPolicy(sandboxRequest({ byokCredentialState: "missing" })),
    ).toEqual({
      allowed: false,
      failure: {
        code: "inference_source_required",
        remediation: ["add_byok", "upgrade_to_pro"],
      },
    });
  });

  test("fails closed when persisted sandbox accounting is not finite", () => {
    expect(
      evaluateAccessPolicy(
        sandboxRequest({
          usage: {
            byokPeriodConsumedMilliseconds: Number.NaN,
            proPeriodConsumedMilliseconds: 0,
            runningSandboxCount: 0,
          },
        }),
      ),
    ).toEqual({
      allowed: false,
      failure: {
        code: "access_state_invalid",
        remediation: ["retry_later"],
      },
    });
  });
});
