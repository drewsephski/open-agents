import type { SubscriptionSnapshot } from "./billing-reconciliation";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";
import { describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { createBillingEventProcessor } =
  await import("./billing-reconciliation");
const period = {
  start: new Date("2026-10-02T00:00:00Z"),
  end: new Date("2026-11-02T00:00:00Z"),
};
function fixture() {
  const financial: unknown[] = [];
  const synced: ManagedEntitlementState[] = [];
  const processed = new Set<string>();
  let failed = 0;
  const subscription: SubscriptionSnapshot = {
    id: "sub_1",
    providerCustomerId: "cust_1",
    providerProductId: "prod_pro",
    providerPriceId: "prod_pro",
    status: "active",
    cancelAtPeriodEnd: false,
    periodStart: period.start,
    periodEnd: period.end,
    canceledAt: null,
    metadataUserId: "owner",
  };
  const entitlement: ManagedEntitlementState = {
    id: "ent_1",
    userId: "owner",
    state: "inactive",
    periodStart: period.start,
    periodEnd: period.end,
  };
  const store: Parameters<typeof createBillingEventProcessor>[0]["store"] = {
    claimEvent: async ({ id }) =>
      processed.has(id)
        ? { state: "duplicate" }
        : {
            state: "claimed",
            claim: { eventId: id, token: "lease", generation: 1 },
          },
    markEventProcessed: async (claim) => {
      processed.add(claim.eventId);
      return true;
    },
    markEventFailed: async () => {
      failed++;
      return true;
    },
    getUserIdForProviderCustomer: async () => null,
    hasCheckoutForUser: async () => true,
    linkCustomer: async () => {},
    reconcileSubscription: async () => entitlement,
    reconcileFinancialState: async (input) => {
      financial.push(input);
      return {
        ...entitlement,
        state: input.financialState === "paid" ? "active" : "inactive",
      };
    },
  };
  const processor = createBillingEventProcessor({
    proProductId: "prod_pro",
    store,
    provider: { retrieveSubscription: async () => subscription },
    managedKeys: {
      sync: async (input) => {
        synced.push(input);
      },
    },
  });
  return {
    processor,
    store,
    subscription,
    financial,
    synced,
    failed: () => failed,
  };
}
function event(type: string, extra: Record<string, unknown> = {}) {
  return {
    webhookId: `evt_${type}`,
    webhookEventType: type,
    webhookCreatedAt: Date.parse("2026-10-02T00:01:00Z"),
    id: "sub_1",
    current_period_start_date: period.start.toISOString(),
    current_period_end_date: period.end.toISOString(),
    ...extra,
  };
}
describe("Creem payment reconciliation", () => {
  test("checkout completion alone cannot activate paid access", async () => {
    const f = fixture();
    await f.processor.process(
      event("checkout.completed", { subscription: "sub_1" }),
    );
    expect(f.financial).toHaveLength(0);
    expect(f.synced[0]?.state).toBe("inactive");
  });
  test("active and trial events do not establish a paid allowance", async () => {
    const f = fixture();
    await f.processor.process(event("subscription.active"));
    await f.processor.process(event("subscription.trialing"));
    expect(f.financial).toHaveLength(0);
  });
  test("a paid event binds payment proof to the exact period", async () => {
    const f = fixture();
    await f.processor.process(event("subscription.paid"));
    expect(f.financial[0]).toMatchObject({
      subscriptionId: "sub_1",
      financialState: "paid",
      period,
    });
    expect(f.synced[0]?.state).toBe("active");
  });
  test("verified API recovery checks subscription ownership before linking or granting access", async () => {
    const f = fixture();
    await expect(
      f.processor.reconcileVerifiedPayment({
        userId: "different-owner",
        subscriptionId: "sub_1",
        transactionId: "tran_1",
        paidAt: period.start,
        period,
        financialState: "paid",
      }),
    ).rejects.toThrow("billing_event_processing_failed");
    expect(f.financial).toEqual([]);
    expect(f.synced).toEqual([]);
  });
  test("duplicates do not provision or reset the allowance twice", async () => {
    const f = fixture();
    const input = event("subscription.paid");
    await f.processor.process(input);
    expect(await f.processor.process(input)).toEqual({ duplicate: true });
    expect(f.synced).toHaveLength(1);
  });
  test("unowned metadata and unrelated products cannot grant access", async () => {
    const f = fixture();
    f.store.hasCheckoutForUser = async () => false;
    await f.processor.process(event("subscription.paid"));
    expect(f.financial).toHaveLength(0);
    f.store.hasCheckoutForUser = async () => true;
    f.subscription.providerProductId = "prod_other";
    await f.processor.process(
      event("subscription.paid", { webhookId: "evt_other" }),
    );
    expect(f.financial).toHaveLength(0);
  });
  test("conflicting customer ownership fails without provisioning", async () => {
    const f = fixture();
    f.store.getUserIdForProviderCustomer = async () => "different-owner";
    await expect(
      f.processor.process(event("subscription.paid")),
    ).rejects.toThrow("billing_event_processing_failed");
    expect(f.failed()).toBe(1);
    expect(f.synced).toHaveLength(0);
  });
  test("scheduled cancellation synchronizes without revoking paid-through access", async () => {
    const f = fixture();
    f.subscription.cancelAtPeriodEnd = true;
    await f.processor.process(event("subscription.scheduled_cancel"));
    expect(f.financial).toHaveLength(0);
  });
  test("past-due and expired events record unpaid state for their period", async () => {
    const f = fixture();
    await f.processor.process(event("subscription.past_due"));
    await f.processor.process(event("subscription.expired"));
    expect(f.financial).toHaveLength(2);
    expect(f.financial[0]).toMatchObject({ financialState: "unpaid", period });
  });
  test("full refunds and disputes revoke the affected paid period", async () => {
    const f = fixture();
    const transaction = {
      subscription: "sub_1",
      amount_paid: 2900,
      refunded_amount: 2900,
      period_start: period.start.getTime(),
      period_end: period.end.getTime(),
    };
    await f.processor.process(
      event("refund.created", { status: "succeeded", transaction }),
    );
    await f.processor.process(event("dispute.created", { transaction }));
    expect(f.financial[0]).toMatchObject({
      financialState: "fully_refunded",
      period,
    });
    expect(f.financial[1]).toMatchObject({ financialState: "disputed" });
  });
  test("partial refunds preserve financial eligibility and failed refunds do nothing", async () => {
    const f = fixture();
    const transaction = {
      subscription: "sub_1",
      amount_paid: 2900,
      refunded_amount: 1000,
      period_start: period.start.getTime(),
      period_end: period.end.getTime(),
    };
    await f.processor.process(
      event("refund.created", { status: "succeeded", transaction }),
    );
    expect(f.financial[0]).toMatchObject({
      financialState: "partially_refunded",
    });
    await f.processor.process(
      event("refund.created", {
        webhookId: "evt_failed",
        status: "failed",
        transaction,
      }),
    );
    expect(f.financial).toHaveLength(1);
  });
  test("a key-provisioning failure remains retryable", async () => {
    const f = fixture();
    f.store.markEventProcessed = async () => false;
    await expect(
      f.processor.process(event("subscription.paid")),
    ).rejects.toThrow();
    expect(f.failed()).toBe(1);
  });
});
