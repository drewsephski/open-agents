import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const {
  accrueRunningSandboxMilliseconds,
  createSandboxAllowanceService,
  getAllowanceWarningLevel,
  SandboxAccessDeniedError,
  toSandboxAccessErrorResponse,
} = await import("./allowance");

describe("sandbox allowance", () => {
  test("meters only running wall-clock time and multiplies concurrent sandboxes", () => {
    expect(
      accrueRunningSandboxMilliseconds({
        consumedMilliseconds: 60_000,
        runningSandboxCount: 2,
        lastMeteredAt: new Date("2026-08-01T00:00:00.000Z"),
        now: new Date("2026-08-01T00:05:00.000Z"),
        periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBe(660_000);
    expect(
      accrueRunningSandboxMilliseconds({
        consumedMilliseconds: 60_000,
        runningSandboxCount: 0,
        lastMeteredAt: new Date("2026-08-01T00:00:00.000Z"),
        now: new Date("2026-08-01T00:05:00.000Z"),
        periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBe(60_000);
  });

  test("stops accrual at the period boundary and exposes warning states", () => {
    expect(
      accrueRunningSandboxMilliseconds({
        consumedMilliseconds: 0,
        runningSandboxCount: 1,
        lastMeteredAt: new Date("2026-08-31T23:55:00.000Z"),
        now: new Date("2026-09-01T00:05:00.000Z"),
        periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBe(300_000);
    expect(getAllowanceWarningLevel(74, 100)).toBe("none");
    expect(getAllowanceWarningLevel(75, 100)).toBe("passive");
    expect(getAllowanceWarningLevel(90, 100)).toBe("prominent");
    expect(getAllowanceWarningLevel(100, 100)).toBe("exhausted");
  });

  test("keeps sandbox admission and confirmation separate so denial preserves state", async () => {
    const confirmations: string[] = [];
    const service = createSandboxAllowanceService({
      loadAccessState: async () => ({
        byokCredentialState: "valid",
        subscription: null,
      }),
      store: {
        admit: async () => ({
          allowed: false,
          failure: {
            code: "sandbox_allowance_exhausted",
            remediation: ["wait_for_reset"],
          },
        }),
        confirm: async (sessionId) => {
          confirmations.push(sessionId);
        },
        release: async () => {},
        meter: async () => {},
      },
    });

    const result = await service.admit({
      userId: "user-1",
      sessionId: "session-1",
      operation: "resume",
    });

    expect(result).toEqual({
      allowed: false,
      failure: {
        code: "sandbox_allowance_exhausted",
        remediation: ["wait_for_reset"],
      },
    });
    expect(confirmations).toEqual([]);
  });

  test("serializes exhausted allowance state for API consumers", async () => {
    const period = {
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-09-01T00:00:00.000Z"),
    };
    const response = toSandboxAccessErrorResponse(
      new SandboxAccessDeniedError({
        code: "sandbox_allowance_exhausted",
        remediation: ["wait_for_reset"],
        resetAt: period.end,
        allowanceState: {
          warning: "exhausted",
          period,
          used: 7_200_000,
          limit: 7_200_000,
          remaining: 0,
        },
      }),
    );

    expect(await response.json()).toMatchObject({
      error: {
        allowanceState: {
          warning: "exhausted",
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
          },
          used: 7_200_000,
          limit: 7_200_000,
          remaining: 0,
        },
      },
    });
  });
});
