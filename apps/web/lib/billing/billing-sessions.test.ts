import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { BillingSessionError, createBillingSessionService } =
  await import("./billing-sessions");

const config = {
  proPriceId: "price_pro_monthly",
  appOrigin: "https://launchstack.sh",
};

function availableCheckoutStore() {
  return {
    claimCheckout: async () => ({
      state: "claimed" as const,
      claim: { token: "claim", generation: 1 },
    }),
    publishCheckout: async (input: {
      session: { id: string; url: string; expiresAt: Date };
    }) => ({
      accepted: true,
      currentSession: input.session,
    }),
    failCheckout: async () => true,
  };
}

function emptyCheckoutSessionOperations() {
  return {
    list: async () => ({ data: [] }),
    expire: async () => undefined,
  };
}

function emptySubscriptionOperations() {
  return { list: async () => ({ data: [] }) };
}

describe("billing sessions", () => {
  test("creates an owned monthly Pro Checkout Session with dynamic payment methods", async () => {
    const checkoutCalls: unknown[] = [];
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            ...emptyCheckoutSessionOperations(),
            create: async (params) => {
              checkoutCalls.push(params);
              return { id: "cs_123", url: "https://checkout.stripe.com/c/123" };
            },
          },
        },
        subscriptions: emptySubscriptionOperations(),
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/123" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => "cus_owned",
      },
      checkoutStore: availableCheckoutStore(),
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
            ...emptyCheckoutSessionOperations(),
            create: async (params) => {
              checkoutCalls.push(params);
              return { id: "cs_new", url: "https://checkout.stripe.com/c/new" };
            },
          },
        },
        subscriptions: emptySubscriptionOperations(),
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/new" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => null,
      },
      checkoutStore: availableCheckoutStore(),
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
            ...emptyCheckoutSessionOperations(),
            create: async () => ({ id: "cs_unused", url: null }),
          },
        },
        subscriptions: emptySubscriptionOperations(),
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
      checkoutStore: availableCheckoutStore(),
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
    ).rejects.toBeInstanceOf(BillingSessionError);
  });

  test("allows only one concurrent first-time Checkout creation", async () => {
    let checkoutCreateCount = 0;
    let releaseFirstCreate: (() => void) | undefined;
    const firstCreateBlocked = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve;
    });
    let claimed = false;
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            ...emptyCheckoutSessionOperations(),
            create: async () => {
              checkoutCreateCount += 1;
              if (checkoutCreateCount === 1) {
                await firstCreateBlocked;
              }
              return {
                id: `cs_${checkoutCreateCount}`,
                url: `https://checkout.stripe.com/c/${checkoutCreateCount}`,
                expires_at: 1_788_220_800,
              };
            },
          },
        },
        subscriptions: emptySubscriptionOperations(),
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/new" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => null,
      },
      checkoutStore: {
        claimCheckout: async () => {
          if (claimed) {
            return { state: "busy" as const };
          }
          claimed = true;
          return {
            state: "claimed" as const,
            claim: { token: "claim-1", generation: 1 },
          };
        },
        publishCheckout: async (input: {
          session: { id: string; url: string; expiresAt: Date };
        }) => ({
          accepted: true,
          currentSession: input.session,
        }),
        failCheckout: async () => true,
      },
      config,
      integrationSuffix: () => "concurre",
    });

    const first = service.createCheckout({
      userId: "user-concurrent",
      email: "owner@example.com",
    });
    while (checkoutCreateCount === 0) {
      await Promise.resolve();
    }
    await expect(
      service.createCheckout({
        userId: "user-concurrent",
        email: "owner@example.com",
      }),
    ).rejects.toThrow("billing_checkout_in_progress");
    expect(checkoutCreateCount).toBe(1);

    releaseFirstCreate?.();
    await expect(first).resolves.toMatchObject({ id: "cs_1" });
  });

  test("reuses the authoritative open Checkout reservation on repeat requests", async () => {
    let stripeCallCount = 0;
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            ...emptyCheckoutSessionOperations(),
            create: async () => {
              stripeCallCount += 1;
              return { id: "cs_unexpected", url: null };
            },
          },
        },
        subscriptions: emptySubscriptionOperations(),
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/new" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => {
          stripeCallCount += 1;
          return null;
        },
      },
      checkoutStore: {
        claimCheckout: async () => ({
          state: "existing" as const,
          session: {
            id: "cs_existing",
            url: "https://checkout.stripe.com/c/existing",
            expiresAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        }),
        publishCheckout: async () => ({
          accepted: false,
          currentSession: null,
        }),
        failCheckout: async () => false,
      },
      config,
    });

    await expect(
      service.createCheckout({ userId: "user-1", email: "owner@example.com" }),
    ).resolves.toEqual({
      id: "cs_existing",
      url: "https://checkout.stripe.com/c/existing",
    });
    expect(stripeCallCount).toBe(0);
  });

  test("denies a second Pro subscription found on the owned Stripe customer", async () => {
    let checkoutCreateCount = 0;
    const service = createBillingSessionService({
      stripe: {
        checkout: {
          sessions: {
            create: async () => {
              checkoutCreateCount += 1;
              return {
                id: "cs_duplicate",
                url: "https://checkout.stripe.com/c",
              };
            },
            list: async () => ({ data: [] }),
            expire: async () => undefined,
          },
        },
        subscriptions: {
          list: async () => ({
            data: [{ id: "sub_existing", status: "active" }],
          }),
        },
        billingPortal: {
          sessions: {
            create: async () => ({ url: "https://billing.stripe.com/p/owned" }),
          },
        },
      },
      customerStore: {
        getStripeCustomerIdForUser: async () => "cus_owned",
      },
      checkoutStore: availableCheckoutStore(),
      config,
      integrationSuffix: () => "existing",
    });

    await expect(
      service.createCheckout({ userId: "user-1", email: "owner@example.com" }),
    ).rejects.toThrow("pro_subscription_exists");
    expect(checkoutCreateCount).toBe(0);
  });
});
