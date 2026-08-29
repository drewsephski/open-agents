import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { createStripeSubscriptionReader } =
  await import("./stripe-subscription-reader");

type ReaderStripe = Parameters<
  typeof createStripeSubscriptionReader
>[0]["stripe"];

describe("Stripe subscription reader", () => {
  test("normalizes the current SDK subscription-item billing-period shape", async () => {
    const stripe = {
      subscriptions: {
        retrieve: async () => ({
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: true,
          canceled_at: null,
          metadata: { launchstack_user_id: "user-1" },
          items: {
            data: [
              {
                current_period_start: 1_785_542_400,
                current_period_end: 1_788_220_800,
                price: { id: "price_pro", product: "prod_pro" },
              },
            ],
          },
        }),
      },
      invoicePayments: { list: async () => ({ data: [] }) },
      invoices: { retrieve: async () => ({ deleted: true, id: "in_1" }) },
    } as unknown as ReaderStripe;
    const reader = createStripeSubscriptionReader({
      stripe,
      proPriceId: "price_pro",
    });

    await expect(reader.retrieveSubscription("sub_1")).resolves.toEqual({
      id: "sub_1",
      stripeCustomerId: "cus_1",
      stripeProductId: "prod_pro",
      stripePriceId: "price_pro",
      status: "active",
      cancelAtPeriodEnd: true,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      canceledAt: null,
      metadataUserId: "user-1",
    });
  });

  test("resolves a subscription from the current Invoice Payment relation", async () => {
    const listCalls: unknown[] = [];
    const stripe = {
      subscriptions: { retrieve: async () => ({}) },
      invoicePayments: {
        list: async (params: unknown) => {
          listCalls.push(params);
          return {
            data: [
              {
                invoice: {
                  id: "in_1",
                  parent: {
                    subscription_details: { subscription: "sub_1" },
                  },
                },
              },
            ],
          };
        },
      },
      invoices: { retrieve: async () => ({}) },
    } as unknown as ReaderStripe;
    const reader = createStripeSubscriptionReader({
      stripe,
      proPriceId: "price_pro",
    });

    await expect(
      reader.resolveSubscriptionIdForPaymentIntent("pi_1"),
    ).resolves.toBe("sub_1");
    expect(listCalls).toEqual([
      {
        payment: { type: "payment_intent", payment_intent: "pi_1" },
        limit: 1,
        expand: ["data.invoice"],
      },
    ]);
  });
});
