import "server-only";
import type StripeSdk from "stripe";
import { subscriptionStatusSchema } from "@/lib/access/subscription-state";
import type { StripeSubscriptionSnapshot } from "./billing-reconciliation";

interface StripeSubscriptionReaderDependencies {
  stripe: Pick<StripeSdk, "subscriptions" | "invoicePayments" | "invoices">;
  proPriceId: string;
}

function resourceId(resource: { id: string } | string): string {
  return typeof resource === "string" ? resource : resource.id;
}

export function createStripeSubscriptionReader(
  dependencies: StripeSubscriptionReaderDependencies,
) {
  return {
    async retrieveSubscription(
      subscriptionId: string,
    ): Promise<StripeSubscriptionSnapshot> {
      const subscription =
        await dependencies.stripe.subscriptions.retrieve(subscriptionId);
      const item =
        subscription.items.data.find(
          (candidate) => candidate.price.id === dependencies.proPriceId,
        ) ?? subscription.items.data[0];
      const status = subscriptionStatusSchema.safeParse(subscription.status);
      if (!item || !status.success) {
        throw new Error("Stripe subscription shape is unsupported");
      }

      return {
        id: subscription.id,
        stripeCustomerId: resourceId(subscription.customer),
        stripeProductId: resourceId(item.price.product),
        stripePriceId: item.price.id,
        status: status.data,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        periodStart: new Date(item.current_period_start * 1000),
        periodEnd: new Date(item.current_period_end * 1000),
        canceledAt:
          subscription.canceled_at === null
            ? null
            : new Date(subscription.canceled_at * 1000),
        metadataUserId:
          subscription.metadata.launchstack_user_id?.trim() || null,
      };
    },

    async resolveSubscriptionIdForPaymentIntent(
      paymentIntentId: string,
    ): Promise<string | null> {
      const invoicePayments = await dependencies.stripe.invoicePayments.list({
        payment: {
          type: "payment_intent",
          payment_intent: paymentIntentId,
        },
        limit: 1,
        expand: ["data.invoice"],
      });
      const invoiceReference = invoicePayments.data[0]?.invoice;
      if (!invoiceReference) {
        return null;
      }
      const invoice =
        typeof invoiceReference === "string" || "deleted" in invoiceReference
          ? await dependencies.stripe.invoices.retrieve(
              resourceId(invoiceReference),
            )
          : invoiceReference;
      if ("deleted" in invoice) {
        return null;
      }
      const subscription = invoice.parent?.subscription_details?.subscription;
      return subscription ? resourceId(subscription) : null;
    },
  };
}
