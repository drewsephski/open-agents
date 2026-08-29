import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let session: { user: { id: string } } | null = { user: { id: "user-1" } };
const portalCalls: string[] = [];

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => session,
}));
mock.module("@/lib/billing/billing-runtime", () => ({
  createProCheckoutSession: async () => ({ id: "unused", url: "unused" }),
  createCustomerPortalSession: async (input: { userId: string }) => {
    portalCalls.push(input.userId);
    return { url: "https://billing.stripe.com/p/1" };
  },
  getStripeWebhookHandler: () => ({
    handle: async () => ({ duplicate: false }),
  }),
}));

const routeModulePromise = import("./route");

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    session = { user: { id: "user-1" } };
    portalCalls.length = 0;
  });

  test("requires authentication", async () => {
    session = null;
    const { POST } = await routeModulePromise;

    const response = await POST();

    expect(response.status).toBe(401);
    expect(portalCalls).toHaveLength(0);
  });

  test("uses only the authenticated user's persisted customer ownership", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST();

    expect(response.status).toBe(200);
    expect(portalCalls).toEqual(["user-1"]);
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/p/1",
    });
  });
});
