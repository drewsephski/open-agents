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

const CURRENT_PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const CURRENT_PERIOD_END = new Date("2026-09-01T00:00:00.000Z");

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

function invoiceEvent(
  id: string,
  type:
    | "invoice.paid"
    | "invoice.payment_failed"
    | "invoice.voided"
    | "invoice.finalization_failed"
    | "invoice.marked_uncollectible",
  created: number,
  status: "open" | "paid" | "uncollectible" | "void",
  period?: { start: Date; end: Date },
): StripeSdk.Event {
  const invoicePeriod = period ?? {
    start: CURRENT_PERIOD_START,
    end: CURRENT_PERIOD_END,
  };
  return stripeEvent(id, type, created, {
    id: `in_${id}`,
    object: "invoice",
    status,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_1" },
    },
    lines: {
      data: [
        {
          period: {
            start: invoicePeriod.start.getTime() / 1000,
            end: invoicePeriod.end.getTime() / 1000,
          },
          pricing: {
            type: "price_details",
            price_details: { price: "price_pro_monthly" },
          },
        },
      ],
    },
  });
}

function createHarness() {
  const receipts = new Map<
    string,
    {
      state: "processing" | "processed" | "failed";
      token: string | null;
      generation: number;
      expired: boolean;
    }
  >();
  const customers = new Map<string, string>();
  const subscriptions = new Map<
    string,
    {
      latestEventCreatedAt: Date;
      status: SubscriptionStatus;
      financialState:
        | "unpaid"
        | "paid"
        | "partially_refunded"
        | "fully_refunded"
        | "disputed";
      paidPeriodStart: Date | null;
      paidPeriodEnd: Date | null;
      latestFinancialEventCreatedAt: Date | null;
      latestFinancialEventId: string | null;
      entitlement: ManagedEntitlementState;
    }
  >();
  const syncCalls: ManagedEntitlementState[] = [];
  const retrieveCalls: string[] = [];
  let canonicalStatus: SubscriptionStatus = "active";
  let canonicalCancelAtPeriodEnd = false;
  let canonicalPeriod = {
    start: CURRENT_PERIOD_START,
    end: CURRENT_PERIOD_END,
  };
  let syncError: Error | null = null;
  let syncGate: Promise<void> | null = null;
  let releaseSync: (() => void) | null = null;

  const processor = createBillingEventProcessor({
    proPriceId: "price_pro_monthly",
    store: {
      claimEvent: async (event) => {
        const receipt = receipts.get(event.id);
        if (receipt?.state === "processed") {
          return { state: "duplicate" as const };
        }
        if (receipt?.state === "processing" && !receipt.expired) {
          return { state: "busy" as const };
        }
        const generation = (receipt?.generation ?? 0) + 1;
        const token = `receipt-${event.id}-${generation}`;
        receipts.set(event.id, {
          state: "processing",
          token,
          generation,
          expired: false,
        });
        return {
          state: "claimed" as const,
          claim: { eventId: event.id, token, generation },
        };
      },
      markEventProcessed: async (claim) => {
        const receipt = receipts.get(claim.eventId);
        if (
          receipt?.state !== "processing" ||
          receipt.token !== claim.token ||
          receipt.generation !== claim.generation
        ) {
          return false;
        }
        receipt.state = "processed";
        receipt.token = null;
        return true;
      },
      markEventFailed: async (input) => {
        const receipt = receipts.get(input.claim.eventId);
        if (
          receipt?.state !== "processing" ||
          receipt.token !== input.claim.token ||
          receipt.generation !== input.claim.generation
        ) {
          return false;
        }
        receipt.state = "failed";
        receipt.token = null;
        return true;
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
          const periodUnchanged =
            existing?.entitlement.periodStart.getTime() ===
              input.subscription.periodStart.getTime() &&
            existing.entitlement.periodEnd.getTime() ===
              input.subscription.periodEnd.getTime();
          const financialState = periodUnchanged
            ? (existing?.financialState ?? "unpaid")
            : "unpaid";
          const paidPeriodStart = periodUnchanged
            ? (existing?.paidPeriodStart ?? null)
            : null;
          const paidPeriodEnd = periodUnchanged
            ? (existing?.paidPeriodEnd ?? null)
            : null;
          const state =
            input.subscription.status === "active" &&
            (financialState === "paid" ||
              financialState === "partially_refunded") &&
            paidPeriodStart?.getTime() ===
              input.subscription.periodStart.getTime() &&
            paidPeriodEnd?.getTime() === input.subscription.periodEnd.getTime()
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
            paidPeriodStart,
            paidPeriodEnd,
            latestFinancialEventCreatedAt: periodUnchanged
              ? (existing?.latestFinancialEventCreatedAt ?? null)
              : null,
            latestFinancialEventId: periodUnchanged
              ? (existing?.latestFinancialEventId ?? null)
              : null,
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
        if (
          input.period.start.getTime() !==
            existing.entitlement.periodStart.getTime() ||
          input.period.end.getTime() !==
            existing.entitlement.periodEnd.getTime()
        ) {
          return existing.entitlement;
        }
        if (
          existing.latestFinancialEventCreatedAt &&
          (input.eventCreatedAt < existing.latestFinancialEventCreatedAt ||
            (input.eventCreatedAt.getTime() ===
              existing.latestFinancialEventCreatedAt.getTime() &&
              existing.latestFinancialEventId !== null &&
              input.eventId <= existing.latestFinancialEventId))
        ) {
          return existing.entitlement;
        }
        existing.financialState = input.financialState;
        existing.paidPeriodStart =
          input.financialState === "unpaid" ? null : input.period.start;
        existing.paidPeriodEnd =
          input.financialState === "unpaid" ? null : input.period.end;
        existing.latestFinancialEventCreatedAt = input.eventCreatedAt;
        existing.latestFinancialEventId = input.eventId;
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
          cancelAtPeriodEnd: canonicalCancelAtPeriodEnd,
          periodStart: canonicalPeriod.start,
          periodEnd: canonicalPeriod.end,
          canceledAt: null,
          metadataUserId: "user-1",
        };
      },
      resolveSubscriptionPeriodForPaymentIntent: async () => ({
        subscriptionId: "sub_1",
        period: { start: CURRENT_PERIOD_START, end: CURRENT_PERIOD_END },
      }),
    },
    managedKeys: {
      sync: async (entitlement) => {
        syncCalls.push(entitlement);
        if (syncGate) {
          const gate = syncGate;
          syncGate = null;
          await gate;
        }
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
    setCanonicalCancelAtPeriodEnd(value: boolean) {
      canonicalCancelAtPeriodEnd = value;
    },
    setCanonicalPeriod(start: Date, end: Date) {
      canonicalPeriod = { start, end };
    },
    setSyncError(error: Error | null) {
      syncError = error;
    },
    expireReceiptLease(eventId: string) {
      const receipt = receipts.get(eventId);
      if (receipt) {
        receipt.expired = true;
      }
    },
    blockNextSync() {
      syncGate = new Promise<void>((resolve) => {
        releaseSync = resolve;
      });
      return () => releaseSync?.();
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
    expect(harness.syncCalls[0]?.state).toBe("inactive");
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
    expect(harness.receipts.get(event.id)?.state).toBe("processed");
  });

  test("fences a stale webhook worker after its processing lease is reclaimed", async () => {
    const harness = createHarness();
    const event = subscriptionEvent(
      "evt_receipt_overlap",
      1_786_000_011,
      "active",
    );
    const releaseFirstSync = harness.blockNextSync();

    const first = harness.processor.process(event);
    while (harness.syncCalls.length === 0) {
      await Promise.resolve();
    }
    harness.expireReceiptLease(event.id);
    await expect(harness.processor.process(event)).resolves.toEqual({
      duplicate: false,
    });
    releaseFirstSync();
    await expect(first).rejects.toThrow("billing_event_processing_failed");

    expect(harness.receipts.get(event.id)).toMatchObject({
      state: "processed",
      generation: 2,
      token: null,
    });
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

  test("reconciles the actual Stripe paused and resumed subscription events", async () => {
    const harness = createHarness();
    harness.setCanonicalStatus("paused");

    await harness.processor.process(
      stripeEvent("evt_paused", "customer.subscription.paused", 1_786_000_021, {
        id: "sub_1",
        object: "subscription",
      }),
    );
    expect(harness.subscriptions.get("sub_1")?.status).toBe("paused");
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");

    harness.setCanonicalStatus("active");
    await harness.processor.process(
      stripeEvent(
        "evt_resumed",
        "customer.subscription.resumed",
        1_786_000_022,
        { id: "sub_1", object: "subscription" },
      ),
    );
    expect(harness.subscriptions.get("sub_1")?.status).toBe("active");
    expect(harness.syncCalls).toHaveLength(2);
  });

  test("grants scheduled-cancellation access but denies delinquent and terminal states", async () => {
    const allowedHarness = createHarness();
    allowedHarness.setCanonicalCancelAtPeriodEnd(true);
    await allowedHarness.processor.process(
      subscriptionEvent("evt_active", 1_786_000_001, "active"),
    );
    await allowedHarness.processor.process(
      invoiceEvent("evt_active_paid", "invoice.paid", 1_786_000_002, "paid"),
    );
    expect(allowedHarness.syncCalls.at(-1)?.state).toBe("active");

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

  test("keeps an active subscription pending until its current-period invoice is paid", async () => {
    const harness = createHarness();

    await harness.processor.process(
      subscriptionEvent("evt_subscription_active", 1_786_000_001, "active"),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");

    await harness.processor.process(
      invoiceEvent(
        "evt_current_invoice_paid",
        "invoice.paid",
        1_786_000_002,
        "paid",
      ),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("active");
  });

  test("resets payment proof at renewal and ignores a paid invoice from the old period", async () => {
    const harness = createHarness();
    await harness.processor.process(
      invoiceEvent("evt_initial_paid", "invoice.paid", 1_786_000_002, "paid"),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("active");

    const renewalPeriod = {
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-10-01T00:00:00.000Z"),
    };
    harness.setCanonicalPeriod(renewalPeriod.start, renewalPeriod.end);
    await harness.processor.process(
      subscriptionEvent("evt_renewed", 1_788_220_801, "active"),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");

    await harness.processor.process(
      invoiceEvent("evt_old_paid", "invoice.paid", 1_788_220_802, "paid"),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("inactive");

    await harness.processor.process(
      invoiceEvent(
        "evt_renewal_paid",
        "invoice.paid",
        1_788_220_803,
        "paid",
        renewalPeriod,
      ),
    );
    expect(harness.syncCalls.at(-1)?.state).toBe("active");
  });

  test("revokes current-period access for invoice and async Checkout payment failures", async () => {
    for (const [type, status] of [
      ["invoice.payment_failed", "open"],
      ["invoice.finalization_failed", "open"],
      ["invoice.voided", "void"],
      ["invoice.marked_uncollectible", "uncollectible"],
    ] as const) {
      const harness = createHarness();
      await harness.processor.process(
        invoiceEvent(`evt_paid_${type}`, "invoice.paid", 1_786_000_001, "paid"),
      );
      await harness.processor.process(
        invoiceEvent(`evt_failed_${type}`, type, 1_786_000_002, status),
      );
      expect(harness.syncCalls.at(-1)?.state).toBe("inactive");
    }

    const asyncHarness = createHarness();
    await asyncHarness.processor.process(
      invoiceEvent("evt_async_paid", "invoice.paid", 1_786_000_001, "paid"),
    );
    await asyncHarness.processor.process(
      stripeEvent(
        "evt_async_failed",
        "checkout.session.async_payment_failed",
        1_786_000_002,
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
      ),
    );
    expect(asyncHarness.syncCalls.at(-1)?.state).toBe("inactive");
  });

  test("marks side-effect failures for safe retry and does not acknowledge access", async () => {
    const harness = createHarness();
    const event = subscriptionEvent("evt_retry", 1_786_000_010, "active");
    harness.setSyncError(new Error("provider management failed"));

    await expect(harness.processor.process(event)).rejects.toThrow(
      "billing_event_processing_failed",
    );
    expect(harness.receipts.get(event.id)?.state).toBe("failed");

    harness.setSyncError(null);
    await expect(harness.processor.process(event)).resolves.toEqual({
      duplicate: false,
    });
    expect(harness.receipts.get(event.id)?.state).toBe("processed");
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
      invoiceEvent("evt_invoice_paid", "invoice.paid", 1_788_220_810, "paid"),
    );

    expect(harness.subscriptions.get("sub_1")).toMatchObject({
      financialState: "paid",
      entitlement: { state: "active" },
    });
    expect(harness.syncCalls.at(-1)?.state).toBe("active");
  });

  test("converges financial events created in the same second by event-id order", async () => {
    const paidThenFailed = createHarness();
    const failedThenPaid = createHarness();
    const created = 1_786_000_050;
    const paid = invoiceEvent("evt_z_paid", "invoice.paid", created, "paid");
    const failed = invoiceEvent(
      "evt_a_failed",
      "invoice.payment_failed",
      created,
      "open",
    );

    await paidThenFailed.processor.process(paid);
    await paidThenFailed.processor.process(failed);
    await failedThenPaid.processor.process(failed);
    await failedThenPaid.processor.process(paid);

    expect(paidThenFailed.subscriptions.get("sub_1")).toMatchObject({
      financialState: "paid",
      entitlement: { state: "active" },
    });
    expect(failedThenPaid.subscriptions.get("sub_1")).toMatchObject({
      financialState: "paid",
      entitlement: { state: "active" },
    });
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
