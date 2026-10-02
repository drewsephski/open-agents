import "server-only";
import { Checkout, Portal } from "@creem_io/nextjs";
import { Creem } from "creem";
import { NextRequest } from "next/server";
import type { BillingProviderSessions } from "./billing-sessions";
import type { SubscriptionSnapshot } from "./billing-reconciliation";

export function createCreemBillingClient(config: {
  apiKey: string;
  testMode: boolean;
  appOrigin: string;
}) {
  const sdk = new Creem({
    apiKey: config.apiKey,
    server: config.testMode ? "test" : "prod",
    retryConfig: { strategy: "none" },
    timeoutMs: 15000,
  });
  const checkout = Checkout({
    apiKey: config.apiKey,
    testMode: config.testMode,
  });
  const portal = Portal({ apiKey: config.apiKey, testMode: config.testMode });
  function redirectUrl(response: Response): string {
    const location = response.headers.get("location");
    if (response.status < 300 || response.status > 399 || !location)
      throw new Error("billing_provider_unavailable");
    const url = new URL(location);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "creem.io" && url.hostname !== "www.creem.io")
    )
      throw new Error("billing_provider_redirect_invalid");
    return url.href;
  }
  const sessions: BillingProviderSessions = {
    async createCheckout(request) {
      // Construct a fresh URL: no customer-supplied commercial or identity inputs survive.
      const url = new URL("/api/billing/checkout", config.appOrigin);
      url.searchParams.set("productId", request.productId);
      url.searchParams.set("requestId", request.requestId);
      url.searchParams.set("units", "1");
      url.searchParams.set("customer", JSON.stringify(request.customer));
      url.searchParams.set("metadata", JSON.stringify(request.metadata));
      url.searchParams.set("referenceId", request.metadata.referenceId);
      url.searchParams.set("successUrl", request.successUrl);
      const redirect = redirectUrl(await checkout(new NextRequest(url)));
      const id = new URL(redirect).pathname.split("/").at(-1);
      if (!id?.startsWith("ch_"))
        throw new Error("billing_checkout_shape_invalid");
      return { id, url: redirect };
    },
    async getCheckout(id) {
      const remote = await sdk.checkouts.retrieve(id);
      return {
        id: remote.id,
        url: remote.checkoutUrl ?? null,
        status: remote.status,
      };
    },
    async createPortal(customerId) {
      const url = new URL("/api/billing/portal", config.appOrigin);
      url.searchParams.set("customerId", customerId);
      return { url: redirectUrl(await portal(new NextRequest(url))) };
    },
  };
  return {
    sessions,
    async retrieveSubscription(id: string): Promise<SubscriptionSnapshot> {
      const remote = await sdk.subscriptions.get(id);
      if (
        !remote.currentPeriodStartDate ||
        !remote.currentPeriodEndDate ||
        remote.currentPeriodEndDate <= remote.currentPeriodStartDate
      )
        throw new Error("billing_period_invalid");
      const productId =
        typeof remote.product === "string" ? remote.product : remote.product.id;
      const customerId =
        typeof remote.customer === "string"
          ? remote.customer
          : remote.customer.id;
      const metadata: unknown = remote.metadata;
      const reference =
        metadata &&
        typeof metadata === "object" &&
        "referenceId" in metadata &&
        typeof metadata.referenceId === "string"
          ? metadata.referenceId
          : null;
      return {
        id: remote.id,
        providerCustomerId: customerId,
        providerProductId: productId,
        providerPriceId: productId,
        status: remote.status === "scheduled_cancel" ? "active" : remote.status,
        cancelAtPeriodEnd: remote.status === "scheduled_cancel",
        periodStart: remote.currentPeriodStartDate,
        periodEnd: remote.currentPeriodEndDate,
        canceledAt: remote.canceledAt ?? null,
        metadataUserId: reference,
      };
    },
  };
}
