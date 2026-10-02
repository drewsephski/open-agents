import { describe, expect, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { getUtcCalendarMonthPeriod } from "./allowance-period";
import {
  DEFAULT_EXECUTION_BACKEND,
  executionBackendSchema,
} from "./execution-backend";
import { managedKeyStateSchema } from "./inference-source";
import { hasPaidThroughAccess } from "./subscription-state";

describe("access domain", () => {
  test("pins existing chats to the Launchstack Native backend", () => {
    expect(DEFAULT_EXECUTION_BACKEND).toBe("launchstack_native");
    expect(executionBackendSchema.options).toEqual([
      "launchstack_native",
      "codex",
      "opencode",
    ]);
  });

  test("preserves the existing application default", () => {
    expect(APP_DEFAULT_MODEL_ID).toBe("openai/gpt-6.1-sol");
  });

  test("represents the persisted managed-key revoking lifecycle", () => {
    expect(managedKeyStateSchema.safeParse("revoking").success).toBe(true);
  });

  test("builds free Sandbox Periods as UTC calendar months", () => {
    expect(
      getUtcCalendarMonthPeriod(new Date("2026-12-31T23:59:59.999Z")),
    ).toEqual({
      start: new Date("2026-12-01T00:00:00.000Z"),
      end: new Date("2027-01-01T00:00:00.000Z"),
    });
  });

  test("treats the paid period end as an exclusive access boundary", () => {
    const periodEnd = new Date("2026-09-01T00:00:00.000Z");

    expect(
      hasPaidThroughAccess(
        {
          status: "active",
          entitlementState: "active",
          financialState: "paid",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd,
          cancelAtPeriodEnd: true,
        },
        periodEnd,
      ),
    ).toBe(false);
  });
});
