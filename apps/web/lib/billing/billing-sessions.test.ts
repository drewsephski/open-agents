import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { BillingCustomerRequiredError, createBillingSessionService } =
  await import("./billing-sessions");

const config = {
  proPriceId: "price_pro_monthly",
  appOrigin: "https://launchstack.sh",
};

describe("billing sessions", () => {
  test("creates an owned monthly Pro Checkout Session with dynamic payment methods", async () => {
    const checkoutCalls: unknown[] = [];
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            create: async (params) => {
              checkoutCalls.push(params);
              return { id: "cs_123", url: "https://checkout.stripe.com/c/123" };
            },
          },
        },
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/123" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => "cus_owned",
      },
      config,
      integrationSuffix: () => "abcdefgh",
    });

    await expect(
      service.createCheckout({
        userId: "user-1",
        email: "owner@example.com",
      }),
    ).resolves.toEqual({
      id: "cs_123",
      url: "https://checkout.stripe.com/c/123",
    });

    expect(checkoutCalls).toEqual([
      {
        mode: "subscription",
        customer: "cus_owned",
        client_reference_id: "user-1",
        integration_identifier: "launchstack_pro_abcdefgh",
        line_items: [{ price: "price_pro_monthly", quantity: 1 }],
        metadata: {
          launchstack_plan: "pro",
          launchstack_user_id: "user-1",
        },
        subscription_data: {
          metadata: {
            launchstack_plan: "pro",
            launchstack_user_id: "user-1",
          },
        },
        success_url: "https://launchstack.sh/settings/billing?checkout=success",
        cancel_url:
          "https://launchstack.sh/settings/billing?checkout=cancelled",
      },
    ]);
    expect(JSON.stringify(checkoutCalls)).not.toContain("payment_method_types");
    expect(JSON.stringify(checkoutCalls)).not.toContain("automatic_tax");
  });

  test("prefills email without creating local ownership before Stripe confirms it", async () => {
    const checkoutCalls: unknown[] = [];
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            create: async (params) => {
              checkoutCalls.push(params);
              return { id: "cs_new", url: "https://checkout.stripe.com/c/new" };
            },
          },
        },
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/new" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => null,
      },
      config,
      integrationSuffix: () => "ijklmnop",
    });

    await service.createCheckout({
      userId: "user-2",
      email: "new@example.com",
    });

    const checkoutParams = checkoutCalls[0] as Record<string, unknown>;
    expect(checkoutParams.customer_email).toBe("new@example.com");
    expect(checkoutParams).not.toHaveProperty("customer");
  });

  test("creates a portal only for the authenticated user's persisted Stripe customer", async () => {
    const portalCalls: unknown[] = [];
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            create: async () => ({ id: "cs_unused", url: null }),
          },
        },
        billingPortal: {
          sessions: {
            create: async (params) => {
              portalCalls.push(params);
              return { url: "https://billing.stripe.com/p/owned" };
            },
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async (userId) =>
          userId === "user-1" ? "cus_owned" : null,
      },
      config,
      integrationSuffix: () => "qrstuvwx",
    });

    await expect(service.createPortal({ userId: "user-1" })).resolves.toEqual({
      url: "https://billing.stripe.com/p/owned",
    });
    expect(portalCalls).toEqual([
      {
        customer: "cus_owned",
        return_url: "https://launchstack.sh/settings/billing",
      },
    ]);
    await expect(
      service.createPortal({ userId: "user-2" }),
    ).rejects.toBeInstanceOf(BillingCustomerRequiredError);
  });
});
