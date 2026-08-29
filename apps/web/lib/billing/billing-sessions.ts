import "server-only";
import { randomInt } from "node:crypto";
import type StripeSdk from "stripe";

const INTEGRATION_ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const INTEGRATION_SUFFIX_LENGTH = 8;

interface BillingSessionStripeClient {
  checkout: {
    sessions: {
      create(
        params: StripeSdk.Checkout.SessionCreateParams,
      ): Promise<{ id: string; url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(
        params: StripeSdk.BillingPortal.SessionCreateParams,
      ): Promise<{ url: string }>;
    };
  };
}

export interface BillingCustomerStore {
  getStripeCustomerIdForUser(userId: string): Promise<string | null>;
}

interface BillingSessionConfig {
  proPriceId: string;
  appOrigin: string;
}

interface BillingSessionDependencies {
  stripe: BillingSessionStripeClient;
  customerStore: BillingCustomerStore;
  config: BillingSessionConfig;
  integrationSuffix?: () => string;
}

export class BillingCustomerRequiredError extends Error {
  constructor() {
    super("billing_customer_required");
    this.name = "BillingCustomerRequiredError";
  }
}

function createIntegrationSuffix(): string {
  return Array.from(
    { length: INTEGRATION_SUFFIX_LENGTH },
    () => INTEGRATION_ALPHABET[randomInt(INTEGRATION_ALPHABET.length)],
  ).join("");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function createBillingSessionService(
  dependencies: BillingSessionDependencies,
) {
  const appOrigin = trimTrailingSlash(dependencies.config.appOrigin);
  const integrationSuffix =
    dependencies.integrationSuffix ?? createIntegrationSuffix;

  return {
    async createCheckout(input: { userId: string; email: string | null }) {
      const stripeCustomerId =
        await dependencies.customerStore.getStripeCustomerIdForUser(
          input.userId,
        );
      const ownershipMetadata = {
        launchstack_plan: "pro",
        launchstack_user_id: input.userId,
      };
      const session = await dependencies.stripe.checkout.sessions.create({
        mode: "subscription",
        ...(stripeCustomerId
          ? { customer: stripeCustomerId }
          : input.email
            ? { customer_email: input.email }
            : {}),
        client_reference_id: input.userId,
        integration_identifier: `launchstack_pro_${integrationSuffix()}`,
        line_items: [{ price: dependencies.config.proPriceId, quantity: 1 }],
        metadata: ownershipMetadata,
        subscription_data: { metadata: ownershipMetadata },
        success_url: `${appOrigin}/settings/billing?checkout=success`,
        cancel_url: `${appOrigin}/settings/billing?checkout=cancelled`,
      });
      if (!session.url) {
        throw new Error("billing_session_unavailable");
      }
      return { id: session.id, url: session.url };
    },

    async createPortal(input: { userId: string }) {
      const stripeCustomerId =
        await dependencies.customerStore.getStripeCustomerIdForUser(
          input.userId,
        );
      if (!stripeCustomerId) {
        throw new BillingCustomerRequiredError();
      }
      const session = await dependencies.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${appOrigin}/settings/billing`,
      });
      return { url: session.url };
    },
  };
}
