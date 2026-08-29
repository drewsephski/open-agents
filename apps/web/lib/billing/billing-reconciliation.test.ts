import { describe, expect, mock, test } from "bun:test";
import type StripeSdk from "stripe";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";

mock.module("server-only", () => ({}));

const { createBillingEventProcessor } =
  await import("./billing-reconciliation");

type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

function stripeEvent(
  id: string,
  type: StripeSdk.Event.Type,
  created: number,
  object: Record<string, unknown>,
): StripeSdk.Event {
  return {
    id,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as StripeSdk.Event;
}

function subscriptionEvent(
  id: string,
  created: number,
  status: SubscriptionStatus,
): StripeSdk.Event {
  return stripeEvent(id, "customer.subscription.updated", created, {
    id: "sub_1",
    object: "subscription",
    status,
  });
}

function createHarness() {
  const receipts = new Map<string, "processing" | "processed" | "failed">();
  const customers = new Map<string, string>();
  const subscriptions = new Map<
    string,
    {
      latestEventCreatedAt: Date;
      status: SubscriptionStatus;
      financialState:
        | "paid"
        | "partially_refunded"
        | "fully_refunded"
        | "disputed";
      entitlement: ManagedEntitlementState;
    }
  >();
  const syncCalls: ManagedEntitlementState[] = [];
  const retrieveCalls: string[] = [];
  let canonicalStatus: SubscriptionStatus = "active";
  let syncError: Error | null = null;

  const processor = createBillingEventProcessor({
    proPriceId: "price_pro_monthly",
    store: {
      claimEvent: async (event) => {
        const state = receipts.get(event.id);
        if (state === "processed") {
          return "duplicate" as const;
        }
        if (state === "processing") {
          return "busy" as const;
        }
        receipts.set(event.id, "processing");
        return "claimed" as const;
      },
      markEventProcessed: async (eventId) => {
        receipts.set(eventId, "processed");
      },
      markEventFailed: async (eventId) => {
        receipts.set(eventId, "failed");
      },
      getUserIdForStripeCustomer: async (stripeCustomerId) =>
        customers.get(stripeCustomerId) ?? null,
      linkCustomer: async (input) => {
        const existing = customers.get(input.stripeCustomerId);
        if (existing && existing !== input.userId) {
          throw new Error("ownership conflict");
        }
        customers.set(input.stripeCustomerId, input.userId);
      },
      reconcileSubscription: async (input) => {
        const existing = subscriptions.get(input.subscription.id);
        if (
          !existing ||
          input.eventCreatedAt.getTime() >=
            existing.latestEventCreatedAt.getTime()
        ) {
          const financialState = existing?.financialState ?? "paid";
          const state =
            input.subscription.status === "active" &&
            (financialState === "paid" ||
              financialState === "partially_refunded")
              ? "active"
              : "inactive";
          const entitlement: ManagedEntitlementState = {
            id: `ent_${input.userId}`,
            userId: input.userId,
            state,
            periodStart: input.subscription.periodStart,
            periodEnd: input.subscription.periodEnd,
          };
          subscriptions.set(input.subscription.id, {
            latestEventCreatedAt: input.eventCreatedAt,
            status: input.subscription.status,
            financialState,
            entitlement,
          });
          return entitlement;
        }
        return existing.entitlement;
      },
      reconcileFinancialState: async (input) => {
        const existing = subscriptions.get(input.subscriptionId);
        if (!existing) {
          throw new Error("subscription must be reconciled first");
        }
        existing.financialState = input.financialState;
        existing.entitlement = {
          ...existing.entitlement,
          state:
            existing.status === "active" &&
            (input.financialState === "paid" ||
              input.financialState === "partially_refunded")
              ? "active"
              : "inactive",
        };
        return existing.entitlement;
      },
    },
    stripe: {
      retrieveSubscription: async (subscriptionId) => {
        retrieveCalls.push(subscriptionId);
        return {
          id: subscriptionId,
          stripeCustomerId: "cus_1",
          stripeProductId: "prod_pro",
          stripePriceId: "price_pro_monthly",
          status: canonicalStatus,
          cancelAtPeriodEnd: false,
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-01T00:00:00.000Z"),
          canceledAt: null,
          metadataUserId: "user-1",
        };
      },
      resolveSubscriptionIdForPaymentIntent: async () => "sub_1",
    },
    managedKeys: {
      sync: async (entitlement) => {
        syncCalls.push(entitlement);
        if (syncError) {
          throw syncError;
        }
      },
    },
  });

  return {
    customers,
    processor,
    receipts,
    retrieveCalls,
    subscriptions,
    syncCalls,
    setCanonicalStatus(status: SubscriptionStatus) {
      canonicalStatus = status;
    },
    setSyncError(error: Error | null) {
      syncError = error;
    },
  };
}

describe("Stripe billing reconciliation", () => {
  test("links Checkout ownership but grants only from the retrieved subscription", async () => {
    const harness = createHarness();
    const event = stripeEvent(
      "evt_checkout",
      "checkout.session.completed",
      1_786_000_000,
      {
        id: "cs_1",
        object: "checkout.session",
        mode: "subscription",
        customer: "cus_1",
        subscription: "sub_1",
        client_reference_id: "user-1",
        metadata: {
          launchstack_plan: "pro",
          launchstack_user_id: "user-1",
        },
      },
    );

    await expect(harness.processor.process(event)).resolves.toEqual({
      duplicate: false,
    });
    expect(harness.customers.get("cus_1")).toBe("user-1");
    expect(harness.retrieveCalls).toEqual(["sub_1"]);
    expect(harness.syncCalls[0]?.state).toBe("active");
  });

  test("links only the customer validated from the canonical subscription", async () => {
    const harness = createHarness();
    const event = stripeEvent(
      "evt_checkout_customer_mismatch",
      "checkout.session.completed",
      1_786_000_000,
      {
        id: "cs_1",
        object: "checkout.session",
        mode: "subscription",
        customer: "cus_unvalidated",
        subscription: "sub_1",
        client_reference_id: "user-1",
        metadata: {
          launchstack_plan: "pro",
          launchstack_user_id: "user-1",
        },
      },
    );

    await expect(harness.processor.process(event)).rejects.toThrow(
      "billing_event_processing_failed",
    );
    expect(harness.customers.has("cus_unvalidated")).toBe(false);
    expect(harness.customers.has("cus_1")).toBe(false);
  });

  test("processes duplicate event receipts exactly once", async () => {
    const harness = createHarness();
    const event = subscriptionEvent("evt_duplicate", 1_786_000_010, "active");

    await harness.processor.process(event);
    await expect(harness.processor.process(event)).resolves.toEqual({
      duplicate: true,
    });

    expect(harness.retrieveCalls).toEqual(["sub_1"]);
    expect(harness.syncCalls).toHaveLength(1);
    expect(harness.receipts.get(event.id)).toBe("processed");
  });

  test("converges when an older active event arrives after a newer canceled event", async () => {
    const harness = createHarness();
    harness.setCanonicalStatus("canceled");

    await harness.processor.process(
      subscriptionEvent("evt_newer", 1_786_000_020, "canceled"),
    );
    await harness.processor.process(
      subscriptionEvent("evt_older", 1_786_000_010, "active"),
    );

    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      status: "canceled",
      entitlement: { state: "inactive" },
    });
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");
  });

  test("grants scheduled-cancellation access but denies delinquent and terminal states", async () => {
    const allowedHarness = createHarness();
    await allowedHarness.processor.process(
      subscriptionEvent("evt_active", 1_786_000_001, "active"),
    );
    expect(allowedHarness.syncCalls[0]?.state).toBe("active");

    for (const status of [
      "past_due",
      "unpaid",
      "paused",
      "canceled",
    ] as const) {
      const deniedHarness = createHarness();
      deniedHarness.setCanonicalStatus(status);
      await deniedHarness.processor.process(
        subscriptionEvent(`evt_${status}`, 1_786_000_001, status),
      );
      expect(deniedHarness.syncCalls[0]?.state).toBe("inactive");
    }
  });

  test("marks side-effect failures for safe retry and does not acknowledge access", async () => {
    const harness = createHarness();
    const event = subscriptionEvent("evt_retry", 1_786_000_010, "active");
    harness.setSyncError(new Error("provider management failed"));

    await expect(harness.processor.process(event)).rejects.toThrow(
      "billing_event_processing_failed",
    );
    expect(harness.receipts.get(event.id)).toBe("failed");

    harness.setSyncError(null);
    await expect(harness.processor.process(event)).resolves.toEqual({
      duplicate: false,
    });
    expect(harness.receipts.get(event.id)).toBe("processed");
  });

  test("revokes managed access for a fully refunded subscription charge", async () => {
    const harness = createHarness();
    const event = stripeEvent("evt_refund", "charge.refunded", 1_786_000_030, {
      id: "ch_1",
      object: "charge",
      amount: 2900,
      amount_refunded: 2900,
      payment_intent: "pi_1",
    });

    await harness.processor.process(event);

    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      financialState: "fully_refunded",
      entitlement: { state: "inactive" },
    });
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");
  });

  test("restores paid financial state from a later subscription invoice payment", async () => {
    const harness = createHarness();
    await harness.processor.process(
      stripeEvent("evt_refund", "charge.refunded", 1_786_000_030, {
        id: "ch_1",
        object: "charge",
        amount: 2900,
        amount_refunded: 2900,
        payment_intent: "pi_1",
      }),
    );

    await harness.processor.process(
      stripeEvent("evt_invoice_paid", "invoice.paid", 1_788_220_810, {
        id: "in_renewal",
        object: "invoice",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_1" },
        },
      }),
    );

    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      financialState: "paid",
      entitlement: { state: "active" },
    });
    expect(harness.syncCalls.at(-1)?.state).toBe("active");
  });

  test("revokes disputed access and restores it only after a won dispute", async () => {
    const harness = createHarness();
    await harness.processor.process(
      stripeEvent(
        "evt_dispute_created",
        "charge.dispute.created",
        1_786_000_030,
        {
          id: "dp_1",
          object: "dispute",
          payment_intent: "pi_1",
          status: "needs_response",
        },
      ),
    );
    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      financialState: "disputed",
      entitlement: { state: "inactive" },
    });

    await harness.processor.process(
      stripeEvent("evt_dispute_won", "charge.dispute.closed", 1_786_000_040, {
        id: "dp_1",
        object: "dispute",
        payment_intent: "pi_1",
        status: "won",
      }),
    );
    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      financialState: "paid",
      entitlement: { state: "active" },
    });
  });
});
