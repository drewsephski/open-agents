import type {
  BillingCheckoutStore,
  BillingProviderSessions,
} from "./billing-sessions";
import type { CheckoutRequestParameters } from "./billing-checkout-request";
import { describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { createBillingSessionService } = await import("./billing-sessions");
function setup() {
  const requests: CheckoutRequestParameters[] = [];
  let storedRequest: CheckoutRequestParameters | null = null;
  const checkoutStore: BillingCheckoutStore = {
    claimCheckout: async () => ({
      state: "claimed",
      claim: { token: "lease", generation: storedRequest ? 1 : 0 },
      request: storedRequest,
    }),
    prepareCheckout: async ({ request }) => {
      storedRequest = request;
      return {
        accepted: true,
        claim: { token: "lease", generation: 1 },
        request,
      };
    },
    publishCheckout: async () => ({ accepted: true, currentSession: null }),
    expireCheckout: async () => true,
    abandonCheckout: async () => true,
  };
  const provider: BillingProviderSessions = {
    createCheckout: async (request) => {
      requests.push(request);
      return { id: "ch_1", url: "https://www.creem.io/checkout/prod_pro/ch_1" };
    },
    getCheckout: async (id) => ({
      id,
      url: "https://www.creem.io/checkout/prod_pro/ch_1",
      status: "pending",
    }),
    createPortal: async (id) => ({
      url: `https://www.creem.io/customer-portal/${id}`,
    }),
  };
  const service = createBillingSessionService({
    provider,
    checkoutStore,
    customerStore: { getProviderCustomerIdForUser: async () => "cust_owned" },
    config: { proProductId: "prod_pro", appOrigin: "https://launchstack.sh" },
  });
  return { service, requests, provider, checkoutStore };
}
describe("Creem billing sessions", () => {
  test("binds one unit, the allowed product, customer and reference to server state", async () => {
    const fixture = setup();
    await fixture.service.createCheckout({
      userId: "owner",
      email: "owner@example.com",
    });
    expect(fixture.requests[0]).toMatchObject({
      productId: "prod_pro",
      units: 1,
      customer: { id: "cust_owned" },
      metadata: { referenceId: "owner", launchstack_plan: "pro" },
      successUrl: "https://launchstack.sh/settings/billing?checkout=success",
    });
  });
  test("reuses the exact durable request after an ambiguous network failure", async () => {
    const fixture = setup();
    const original = fixture.provider.createCheckout;
    let calls = 0;
    fixture.provider.createCheckout = async (request) => {
      const result = await original(request);
      if (++calls === 1) throw new Error("response lost");
      return result;
    };
    await expect(
      fixture.service.createCheckout({
        userId: "owner",
        email: "first@example.com",
      }),
    ).rejects.toThrow("response lost");
    await fixture.service.createCheckout({
      userId: "owner",
      email: "changed@example.com",
    });
    expect(fixture.requests[0]).toEqual(fixture.requests[1]);
  });
  test("refuses another purchase when a subscription already exists", async () => {
    const fixture = setup();
    fixture.checkoutStore.claimCheckout = async () => ({
      state: "subscription_exists",
    });
    await expect(
      fixture.service.createCheckout({ userId: "owner", email: null }),
    ).rejects.toThrow("pro_subscription_exists");
    expect(fixture.requests).toHaveLength(0);
  });
  test("does not return a completed checkout while payment reconciliation is pending", async () => {
    const fixture = setup();
    fixture.checkoutStore.claimCheckout = async () => ({
      state: "existing",
      session: {
        id: "ch_1",
        url: "https://www.creem.io/checkout/prod_pro/ch_1",
        expiresAt: new Date(Date.now() + 1000),
      },
    });
    fixture.provider.getCheckout = async (id) => ({
      id,
      url: null,
      status: "completed",
    });
    await expect(
      fixture.service.createCheckout({ userId: "owner", email: null }),
    ).rejects.toThrow("billing_checkout_in_progress");
  });
  test("reuses the saved redirect when Creem omits a pending checkout URL", async () => {
    const fixture = setup();
    const url = "https://www.creem.io/checkout/prod_pro/ch_1";
    fixture.checkoutStore.claimCheckout = async () => ({
      state: "existing",
      session: {
        id: "ch_1",
        url,
        expiresAt: new Date(Date.now() + 1000),
      },
    });
    fixture.provider.getCheckout = async (id) => ({
      id,
      url: null,
      status: "pending",
    });
    expect(
      await fixture.service.createCheckout({ userId: "owner", email: null }),
    ).toEqual({ id: "ch_1", url });
    expect(fixture.requests).toHaveLength(0);
  });
  test("never uses the saved redirect for an in-flight or mismatched remote checkout", async () => {
    for (const remote of [
      { id: "ch_1", url: null, status: "processing" },
      { id: "ch_other", url: null, status: "pending" },
    ]) {
      const fixture = setup();
      fixture.checkoutStore.claimCheckout = async () => ({
        state: "existing",
        session: {
          id: "ch_1",
          url: "https://www.creem.io/checkout/prod_pro/ch_1",
          expiresAt: new Date(Date.now() + 1000),
        },
      });
      fixture.provider.getCheckout = async () => remote;
      await expect(
        fixture.service.createCheckout({ userId: "owner", email: null }),
      ).rejects.toThrow("checkout_unavailable");
      expect(fixture.requests).toHaveLength(0);
    }
  });
  test("uses only the authenticated owner's persisted customer for portal access", async () => {
    expect(await setup().service.createPortal({ userId: "owner" })).toEqual({
      url: "https://www.creem.io/customer-portal/cust_owned",
    });
  });
});
