import "server-only";
import { createHash, randomInt } from "node:crypto";
import type StripeSdk from "stripe";

const INTEGRATION_ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const INTEGRATION_SUFFIX_LENGTH = 8;

interface BillingSessionStripeClient {
  checkout: {
    sessions: {
      create(
        params: StripeSdk.Checkout.SessionCreateParams,
        options?: { idempotencyKey: string },
      ): Promise<{ id: string; url: string | null; expires_at?: number }>;
      list(params: {
        customer: string;
        status: "open";
        limit: number;
      }): Promise<{
        data: Array<{
          id: string;
          url: string | null;
          expires_at: number;
          mode: string;
          client_reference_id: string | null;
          metadata: Record<string, string> | null;
        }>;
      }>;
      expire(sessionId: string): Promise<unknown>;
    };
  };
  subscriptions: {
    list(params: {
      customer: string;
      price: string;
      status: "all";
      limit: number;
    }): Promise<{ data: Array<{ id: string; status: string }> }>;
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

interface CheckoutSessionReference {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface BillingCheckoutStore {
  claimCheckout(userId: string): Promise<
    | { state: "subscription_exists" }
    | { state: "busy" }
    | { state: "existing"; session: CheckoutSessionReference }
    | {
        state: "claimed";
        claim: { token: string; generation: number };
      }
  >;
  publishCheckout(input: {
    userId: string;
    claim: { token: string; generation: number };
    session: CheckoutSessionReference;
  }): Promise<{
    accepted: boolean;
    currentSession: CheckoutSessionReference | null;
  }>;
  failCheckout(input: {
    userId: string;
    claim: { token: string; generation: number };
  }): Promise<boolean>;
}

interface BillingSessionConfig {
  proPriceId: string;
  appOrigin: string;
}

interface BillingSessionDependencies {
  stripe: BillingSessionStripeClient;
  customerStore: BillingCustomerStore;
  checkoutStore: BillingCheckoutStore;
  config: BillingSessionConfig;
  integrationSuffix?: () => string;
}

export class BillingSessionError extends Error {
  constructor(
    readonly code:
      | "billing_customer_required"
      | "billing_checkout_in_progress"
      | "pro_subscription_exists",
  ) {
    super(code);
    this.name = "BillingSessionError";
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

function checkoutIdempotencyKey(userId: string, generation: number): string {
  const owner = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `launchstack_pro_checkout_${owner}_${generation}`;
}

export function createBillingSessionService(
  dependencies: BillingSessionDependencies,
) {
  const appOrigin = trimTrailingSlash(dependencies.config.appOrigin);
  const integrationSuffix =
    dependencies.integrationSuffix ?? createIntegrationSuffix;

  return {
    async createCheckout(input: { userId: string; email: string | null }) {
      const reservation = await dependencies.checkoutStore.claimCheckout(
        input.userId,
      );
      if (reservation.state === "subscription_exists") {
        throw new BillingSessionError("pro_subscription_exists");
      }
      if (reservation.state === "busy") {
        throw new BillingSessionError("billing_checkout_in_progress");
      }
      if (reservation.state === "existing") {
        return {
          id: reservation.session.id,
          url: reservation.session.url,
        };
      }

      const claim = reservation.claim;
      const stripeCustomerId =
        await dependencies.customerStore.getStripeCustomerIdForUser(
          input.userId,
        );
      const ownershipMetadata = {
        launchstack_plan: "pro",
        launchstack_user_id: input.userId,
      };
      try {
        if (stripeCustomerId) {
          const subscriptions = await dependencies.stripe.subscriptions.list({
            customer: stripeCustomerId,
            price: dependencies.config.proPriceId,
            status: "all",
            limit: 10,
          });
          if (
            subscriptions.data.some(
              (subscription) =>
                subscription.status !== "canceled" &&
                subscription.status !== "incomplete_expired",
            )
          ) {
            throw new BillingSessionError("pro_subscription_exists");
          }
          const sessions = await dependencies.stripe.checkout.sessions.list({
            customer: stripeCustomerId,
            status: "open",
            limit: 10,
          });
          const reusable = sessions.data.find(
            (session) =>
              session.url !== null &&
              session.mode === "subscription" &&
              session.client_reference_id === input.userId &&
              session.metadata?.launchstack_plan === "pro" &&
              session.metadata.launchstack_user_id === input.userId,
          );
          if (reusable?.url) {
            const published = await dependencies.checkoutStore.publishCheckout({
              userId: input.userId,
              claim,
              session: {
                id: reusable.id,
                url: reusable.url,
                expiresAt: new Date(reusable.expires_at * 1000),
              },
            });
            if (published.accepted || published.currentSession) {
              const current = published.currentSession ?? {
                id: reusable.id,
                url: reusable.url,
              };
              return { id: current.id, url: current.url };
            }
            throw new BillingSessionError("billing_checkout_in_progress");
          }
        }
        const session = await dependencies.stripe.checkout.sessions.create(
          {
            mode: "subscription",
            ...(stripeCustomerId
              ? { customer: stripeCustomerId }
              : input.email
                ? { customer_email: input.email }
                : {}),
            client_reference_id: input.userId,
            integration_identifier: `launchstack_pro_${integrationSuffix()}`,
            line_items: [
              { price: dependencies.config.proPriceId, quantity: 1 },
            ],
            metadata: ownershipMetadata,
            subscription_data: { metadata: ownershipMetadata },
            success_url: `${appOrigin}/settings/billing?checkout=success`,
            cancel_url: `${appOrigin}/settings/billing?checkout=cancelled`,
          },
          {
            idempotencyKey: checkoutIdempotencyKey(
              input.userId,
              claim.generation,
            ),
          },
        );
        if (!session.url) {
          throw new Error("billing_session_unavailable");
        }
        const published = await dependencies.checkoutStore.publishCheckout({
          userId: input.userId,
          claim,
          session: {
            id: session.id,
            url: session.url,
            expiresAt: new Date(
              (session.expires_at ??
                Math.floor(Date.now() / 1000) + 24 * 60 * 60) * 1000,
            ),
          },
        });
        if (!published.accepted) {
          if (published.currentSession) {
            if (published.currentSession.id !== session.id) {
              await dependencies.stripe.checkout.sessions.expire(session.id);
            }
            return {
              id: published.currentSession.id,
              url: published.currentSession.url,
            };
          }
          await dependencies.stripe.checkout.sessions.expire(session.id);
          throw new BillingSessionError("billing_checkout_in_progress");
        }
        return { id: session.id, url: session.url };
      } catch (error) {
        await dependencies.checkoutStore.failCheckout({
          userId: input.userId,
          claim,
        });
        throw error;
      }
    },

    async createPortal(input: { userId: string }) {
      const stripeCustomerId =
        await dependencies.customerStore.getStripeCustomerIdForUser(
          input.userId,
        );
      if (!stripeCustomerId) {
        throw new BillingSessionError("billing_customer_required");
      }
      const session = await dependencies.stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${appOrigin}/settings/billing`,
      });
      return { url: session.url };
    },
  };
}
