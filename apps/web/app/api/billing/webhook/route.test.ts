import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const webhookCalls: Array<{ rawBody: string; signature: string | null }> = [];

mock.module("@/lib/billing/billing-runtime", () => ({
  createProCheckoutSession: async () => ({ id: "unused", url: "unused" }),
  createCustomerPortalSession: async () => ({ url: "unused" }),
  getStripeWebhookHandler: () => ({
    handle: async (rawBody: string, signature: string | null) => {
      webhookCalls.push({ rawBody, signature });
      return { duplicate: false };
    },
  }),
}));

const routeModulePromise = import("./route");

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    webhookCalls.length = 0;
  });

  test("passes the exact raw body and Stripe signature to verification", async () => {
    const { POST } = await routeModulePromise;
    const rawBody = '{ "id": "evt_1", "exact": true }\n';
    const response = await POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=123,v1=signed" },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(webhookCalls).toEqual([{ rawBody, signature: "t=123,v1=signed" }]);
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
    });
  });
});
