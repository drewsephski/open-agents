import { describe, expect, mock, test } from "bun:test";
import type {
  RecoveryCheckout,
  RecoveryPayment,
} from "./billing-checkout-recovery";

mock.module("server-only", () => ({}));
const { createBillingCheckoutRecovery } =
  await import("./billing-checkout-recovery");

function fixture() {
  const reconciled: unknown[] = [];
  const checkout: RecoveryCheckout = {
    id: "ch_1",
    requestId: "request_1",
    status: "completed",
    productId: "prod_pro",
    customerId: "cust_1",
    subscriptionId: "sub_1",
    transactionId: "tran_1",
    metadataUserId: "owner",
  };
  const payment: RecoveryPayment = {
    id: "tran_1",
    subscriptionId: "sub_1",
    status: "paid",
    amountPaid: 2900,
    refundedAmount: 0,
    paidAt: new Date("2026-10-02T00:00:01Z"),
    periodStart: new Date("2026-10-02T00:00:00Z"),
    periodEnd: new Date("2026-11-02T00:00:00Z"),
  };
  const requestedIds: string[] = [];
  const dependencies: Parameters<typeof createBillingCheckoutRecovery>[0] = {
    proProductId: "prod_pro",
    store: {
      getCheckoutForUser: async () => ({
        id: "ch_1",
        request: {
          productId: "prod_pro",
          requestId: "request_1",
          units: 1,
          customer: { id: "cust_1" },
          metadata: { referenceId: "owner", launchstack_plan: "pro" },
          successUrl:
            "https://launchstack.sh/settings/billing?checkout=success",
        },
      }),
    },
    provider: {
      retrieveRecoveryCheckout: async (id) => {
        requestedIds.push(id);
        return checkout;
      },
      retrieveRecoveryPayment: async (id) => {
        requestedIds.push(id);
        return payment;
      },
    },
    reconciler: {
      reconcileVerifiedPayment: async (input) => {
        reconciled.push(input);
      },
    },
  };
  return {
    checkout,
    payment,
    dependencies,
    reconciled,
    requestedIds,
    recovery: createBillingCheckoutRecovery(dependencies),
  };
}

describe("checkout return recovery", () => {
  test("recovers a missed webhook using the saved checkout and authenticated payment", async () => {
    const f = fixture();
    await f.recovery.recover("owner");
    expect(f.requestedIds).toEqual(["ch_1", "tran_1"]);
    expect(f.reconciled).toEqual([
      {
        userId: "owner",
        subscriptionId: "sub_1",
        transactionId: "tran_1",
        paidAt: f.payment.paidAt,
        period: { start: f.payment.periodStart, end: f.payment.periodEnd },
        financialState: "paid",
      },
    ]);
  });
  test("a return without a saved checkout or an unpaid pending checkout grants nothing", async () => {
    const f = fixture();
    f.dependencies.store.getCheckoutForUser = async () => null;
    await f.recovery.recover("owner");
    expect(f.requestedIds).toEqual([]);
    const pending = fixture();
    pending.checkout.status = "pending";
    await pending.recovery.recover("owner");
    expect(pending.requestedIds).toEqual(["ch_1"]);
    expect(pending.reconciled).toEqual([]);
  });
  for (const field of [
    "id",
    "requestId",
    "productId",
    "customerId",
    "metadataUserId",
  ] as const) {
    test(`rejects mismatched checkout ${field}`, async () => {
      const f = fixture();
      f.checkout[field] = "someone_else";
      await expect(f.recovery.recover("owner")).rejects.toThrow(
        "billing_checkout_ownership_invalid",
      );
      expect(f.reconciled).toEqual([]);
    });
  }
  for (const field of ["id", "subscriptionId"] as const) {
    test(`rejects mismatched payment ${field}`, async () => {
      const f = fixture();
      f.payment[field] = "other";
      await expect(f.recovery.recover("owner")).rejects.toThrow(
        "billing_checkout_payment_invalid",
      );
      expect(f.reconciled).toEqual([]);
    });
  }
  test("invalid payment periods fail without reconciliation", async () => {
    const f = fixture();
    f.payment.periodEnd = f.payment.periodStart;
    await expect(f.recovery.recover("owner")).rejects.toThrow();
    expect(f.reconciled).toEqual([]);
  });
  test("refunds and chargebacks are reconciled as revocations", async () => {
    for (const [status, financialState] of [
      ["refunded", "fully_refunded"],
      ["chargedBack", "disputed"],
      ["partialRefund", "partially_refunded"],
    ] as const) {
      const f = fixture();
      f.payment.status = status;
      await f.recovery.recover("owner");
      expect(f.reconciled[0]).toMatchObject({ financialState });
    }
  });
  test("provider failures remain retryable", async () => {
    const f = fixture();
    f.dependencies.provider.retrieveRecoveryPayment = async () => {
      throw new Error("provider unavailable");
    };
    await expect(f.recovery.recover("owner")).rejects.toThrow(
      "provider unavailable",
    );
    expect(f.reconciled).toEqual([]);
  });
});
