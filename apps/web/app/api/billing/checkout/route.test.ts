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
    return { id: "cs_1", url: "https://www.creem.io/checkout/prod_pro/ch_1" };
  },
  createCustomerPortalSession: async () => ({ url: "unused" }),
  getCreemWebhookHandler: () => ({
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

    const response = await POST(
      new Request("https://launchstack.sh/api/billing/checkout", {
        method: "POST",
        headers: { origin: "https://launchstack.sh" },
      }),
    );

    expect(response.status).toBe(401);
    expect(checkoutCalls).toHaveLength(0);
  });

  test("creates Checkout only for the authenticated owner", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("https://launchstack.sh/api/billing/checkout", {
        method: "POST",
        headers: { origin: "https://launchstack.sh" },
        body: JSON.stringify({
          referenceId: "victim",
          customerId: "cust_attacker",
          units: 100,
          productId: "prod_other",
          successUrl: "https://attacker.example",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(checkoutCalls).toEqual([
      { userId: "user-1", email: "owner@example.com" },
    ]);
    expect(await response.json()).toEqual({
      id: "cs_1",
      url: "https://www.creem.io/checkout/prod_pro/ch_1",
    });
  });
  test("rejects cross-origin requests and ignores client identity overrides", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("https://launchstack.sh/api/billing/checkout", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: JSON.stringify({
          customerId: "cust_attacker",
          productId: "prod_attacker",
          referenceId: "victim",
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
