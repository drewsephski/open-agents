import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let session: { user: { id: string; email?: string } } | null = {
  user: { id: "user-1", email: "owner@example.com" },
};
const checkoutCalls: Array<{ userId: string; email: string | null }> = [];

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => session,
}));
mock.module("@/lib/billing/billing-runtime", () => ({
  createProCheckoutSession: async (input: {
    userId: string;
    email: string | null;
  }) => {
    checkoutCalls.push(input);
    return { id: "cs_1", url: "https://checkout.stripe.com/c/1" };
  },
  createCustomerPortalSession: async () => ({ url: "unused" }),
  getStripeWebhookHandler: () => ({
    handle: async () => ({ duplicate: false }),
  }),
}));

const routeModulePromise = import("./route");

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    session = { user: { id: "user-1", email: "owner@example.com" } };
    checkoutCalls.length = 0;
  });

  test("requires authentication", async () => {
    session = null;
    const { POST } = await routeModulePromise;

    const response = await POST();

    expect(response.status).toBe(401);
    expect(checkoutCalls).toHaveLength(0);
  });

  test("creates Checkout only for the authenticated owner", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST();

    expect(response.status).toBe(200);
    expect(checkoutCalls).toEqual([
      { userId: "user-1", email: "owner@example.com" },
    ]);
    expect(await response.json()).toEqual({
      id: "cs_1",
      url: "https://checkout.stripe.com/c/1",
    });
  });
});
