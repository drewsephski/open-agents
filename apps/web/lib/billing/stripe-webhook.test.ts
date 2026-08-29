import { describe, expect, mock, test } from "bun:test";
import type StripeSdk from "stripe";

mock.module("server-only", () => ({}));

const { createStripeWebhookHandler, StripeWebhookSignatureError } =
  await import("./stripe-webhook");

const event = {
  id: "evt_1",
  type: "customer.subscription.updated",
} as StripeSdk.Event;

describe("Stripe webhook signature boundary", () => {
  test("verifies the exact raw request body before processing", async () => {
    const verificationCalls: unknown[][] = [];
    const processed: StripeSdk.Event[] = [];
    const handler = createStripeWebhookHandler({
      stripe: {
        webhooks: {
          constructEvent: (payload, signature, secret) => {
            verificationCalls.push([payload, signature, secret]);
            return event;
          },
        },
      },
      webhookSecret: "whsec_test",
      eventProcessor: {
        process: async (verifiedEvent) => {
          processed.push(verifiedEvent);
          return { duplicate: false };
        },
      },
    });
    const rawBody = '{ "id": "evt_1", "data": { "exact": true } }\n';

    await expect(
      handler.handle(rawBody, "t=123,v1=signature"),
    ).resolves.toEqual({ duplicate: false });
    expect(verificationCalls).toEqual([
      [rawBody, "t=123,v1=signature", "whsec_test"],
    ]);
    expect(processed).toEqual([event]);
  });

  test("rejects missing or invalid signatures without processing", async () => {
    const processed: StripeSdk.Event[] = [];
    const handler = createStripeWebhookHandler({
      stripe: {
        webhooks: {
          constructEvent: () => {
            throw new Error("No signatures found");
          },
        },
      },
      webhookSecret: "whsec_test",
      eventProcessor: {
        process: async (verifiedEvent) => {
          processed.push(verifiedEvent);
          return { duplicate: false };
        },
      },
    });

    await expect(handler.handle("{}", null)).rejects.toBeInstanceOf(
      StripeWebhookSignatureError,
    );
    await expect(
      handler.handle("{}", "t=123,v1=invalid"),
    ).rejects.toBeInstanceOf(StripeWebhookSignatureError);
    expect(processed).toHaveLength(0);
  });
});
