import "server-only";
import { createHash } from "node:crypto";
import type { CheckoutRequestParameters } from "./billing-checkout-request";

interface CheckoutSessionReference {
  id: string;
  url: string;
  expiresAt: Date;
}
export interface BillingCustomerStore {
  getProviderCustomerIdForUser(userId: string): Promise<string | null>;
}
export interface BillingCheckoutStore {
  claimCheckout(userId: string): Promise<
    | { state: "subscription_exists" }
    | { state: "busy" }
    | { state: "existing"; session: CheckoutSessionReference }
    | {
        state: "claimed";
        claim: { token: string; generation: number };
        request: CheckoutRequestParameters | null;
      }
  >;
  prepareCheckout(input: {
    userId: string;
    claim: { token: string; generation: number };
    request: CheckoutRequestParameters;
  }): Promise<
    | { accepted: false }
    | {
        accepted: true;
        claim: { token: string; generation: number };
        request: CheckoutRequestParameters;
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
  expireCheckout(userId: string, sessionId: string): Promise<boolean>;
  abandonCheckout(input: {
    userId: string;
    claim: { token: string; generation: number };
  }): Promise<boolean>;
}
export interface BillingProviderSessions {
  createCheckout(
    request: CheckoutRequestParameters,
  ): Promise<{ id: string; url: string }>;
  getCheckout(
    id: string,
  ): Promise<{ id: string; url: string | null; status: string }>;
  createPortal(customerId: string): Promise<{ url: string }>;
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
export function createBillingSessionService(dependencies: {
  provider: BillingProviderSessions;
  customerStore: BillingCustomerStore;
  checkoutStore: BillingCheckoutStore;
  config: { proProductId: string; appOrigin: string };
}) {
  return {
    async createCheckout(input: {
      userId: string;
      email: string | null;
    }): Promise<{ id: string; url: string }> {
      const reservation = await dependencies.checkoutStore.claimCheckout(
        input.userId,
      );
      if (reservation.state === "subscription_exists")
        throw new BillingSessionError("pro_subscription_exists");
      if (reservation.state === "busy")
        throw new BillingSessionError("billing_checkout_in_progress");
      if (reservation.state === "existing") {
        const remote = await dependencies.provider.getCheckout(
          reservation.session.id,
        );
        if (remote.status === "completed")
          throw new BillingSessionError("billing_checkout_in_progress");
        if (remote.status === "expired") {
          if (
            !(await dependencies.checkoutStore.expireCheckout(
              input.userId,
              remote.id,
            ))
          )
            throw new BillingSessionError("billing_checkout_in_progress");
          return this.createCheckout(input);
        }
        if (remote.status !== "pending" || !remote.url)
          throw new Error("checkout_unavailable");
        return { id: remote.id, url: remote.url };
      }
      let claim = reservation.claim;
      let request = reservation.request;
      if (!request) {
        const customerId =
          await dependencies.customerStore.getProviderCustomerIdForUser(
            input.userId,
          );
        const owner = createHash("sha256")
          .update(input.userId)
          .digest("hex")
          .slice(0, 24);
        const prepared = await dependencies.checkoutStore.prepareCheckout({
          userId: input.userId,
          claim,
          request: {
            productId: dependencies.config.proProductId,
            requestId: `launchstack_pro_${owner}_${claim.generation + 1}`,
            units: 1,
            customer: customerId
              ? { id: customerId }
              : input.email
                ? { email: input.email }
                : {},
            metadata: { referenceId: input.userId, launchstack_plan: "pro" },
            successUrl: `${dependencies.config.appOrigin}/settings/billing?checkout=success`,
          },
        });
        if (!prepared.accepted)
          throw new BillingSessionError("billing_checkout_in_progress");
        claim = prepared.claim;
        request = prepared.request;
      }
      // An ambiguous API failure leaves the request claimed. Reclaiming it reuses
      // the exact persisted body and requestId, rather than creating another purchase.
      const created = await dependencies.provider.createCheckout(request);
      const published = await dependencies.checkoutStore.publishCheckout({
        userId: input.userId,
        claim,
        session: {
          ...created,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const current = published.currentSession;
      if (!published.accepted && !current)
        throw new BillingSessionError("billing_checkout_in_progress");
      return current ? { id: current.id, url: current.url } : created;
    },
    async createPortal(input: { userId: string }) {
      const customerId =
        await dependencies.customerStore.getProviderCustomerIdForUser(
          input.userId,
        );
      if (!customerId)
        throw new BillingSessionError("billing_customer_required");
      return dependencies.provider.createPortal(customerId);
    },
  };
}
