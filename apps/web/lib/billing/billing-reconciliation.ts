import "server-only";
import type StripeSdk from "stripe";
import { z } from "zod";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";

const expandableIdSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).passthrough(),
]);

const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  object: z.literal("checkout.session"),
  mode: z.literal("subscription"),
  customer: expandableIdSchema,
  subscription: expandableIdSchema,
  client_reference_id: z.string().min(1),
  metadata: z.object({
    launchstack_plan: z.literal("pro"),
    launchstack_user_id: z.string().min(1),
  }),
});

const subscriptionEventObjectSchema = z.object({
  id: z.string().min(1),
  object: z.literal("subscription"),
});

const chargeRefundedSchema = z.object({
  object: z.literal("charge"),
  amount: z.number().int().nonnegative(),
  amount_refunded: z.number().int().nonnegative(),
  payment_intent: expandableIdSchema.nullable(),
});

const disputeSchema = z.object({
  object: z.literal("dispute"),
  payment_intent: expandableIdSchema.nullable(),
  status: z.string(),
});

const paidInvoiceSchema = z.object({
  object: z.literal("invoice"),
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: expandableIdSchema })
        .nullable(),
    })
    .nullable(),
});

export type ReconciledSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface StripeSubscriptionSnapshot {
  id: string;
  stripeCustomerId: string;
  stripeProductId: string;
  stripePriceId: string;
  status: ReconciledSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  periodStart: Date;
  periodEnd: Date;
  canceledAt: Date | null;
  metadataUserId: string | null;
}

interface BillingEventStore {
  claimEvent(event: {
    id: string;
    type: string;
    createdAt: Date;
  }): Promise<"claimed" | "duplicate" | "busy">;
  markEventProcessed(eventId: string): Promise<void>;
  markEventFailed(eventId: string, errorCode: string): Promise<void>;
  getUserIdForStripeCustomer(stripeCustomerId: string): Promise<string | null>;
  linkCustomer(input: {
    userId: string;
    stripeCustomerId: string;
  }): Promise<void>;
  reconcileSubscription(input: {
    userId: string;
    subscription: StripeSubscriptionSnapshot;
    eventCreatedAt: Date;
  }): Promise<ManagedEntitlementState>;
  reconcileFinancialState(input: {
    subscriptionId: string;
    financialState:
      | "paid"
      | "partially_refunded"
      | "fully_refunded"
      | "disputed";
    eventCreatedAt: Date;
  }): Promise<ManagedEntitlementState>;
}

interface BillingEventProcessorDependencies {
  proPriceId: string;
  store: BillingEventStore;
  stripe: {
    retrieveSubscription(
      subscriptionId: string,
    ): Promise<StripeSubscriptionSnapshot>;
    resolveSubscriptionIdForPaymentIntent(
      paymentIntentId: string,
    ): Promise<string | null>;
  };
  managedKeys: {
    sync(entitlement: ManagedEntitlementState): Promise<void>;
  };
}

export class BillingEventProcessingError extends Error {
  constructor() {
    super("billing_event_processing_failed");
    this.name = "BillingEventProcessingError";
  }
}

function isSubscriptionEvent(type: StripeSdk.Event.Type): boolean {
  return (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  );
}

export function createBillingEventProcessor(
  dependencies: BillingEventProcessorDependencies,
) {
  async function loadOwnedSubscription(
    subscriptionId: string,
    checkoutUserId?: string,
    checkoutCustomerId?: string,
  ) {
    const subscription =
      await dependencies.stripe.retrieveSubscription(subscriptionId);
    if (subscription.stripePriceId !== dependencies.proPriceId) {
      return null;
    }

    const ownedUserId = await dependencies.store.getUserIdForStripeCustomer(
      subscription.stripeCustomerId,
    );
    const metadataUserId = subscription.metadataUserId;
    const candidateUserId = checkoutUserId ?? metadataUserId ?? ownedUserId;
    if (
      !candidateUserId ||
      (checkoutCustomerId &&
        checkoutCustomerId !== subscription.stripeCustomerId) ||
      (checkoutUserId && metadataUserId && checkoutUserId !== metadataUserId) ||
      (ownedUserId && ownedUserId !== candidateUserId)
    ) {
      throw new BillingEventProcessingError();
    }

    await dependencies.store.linkCustomer({
      userId: candidateUserId,
      stripeCustomerId: subscription.stripeCustomerId,
    });
    return { subscription, userId: candidateUserId };
  }

  async function reconcileSubscription(
    subscriptionId: string,
    eventCreatedAt: Date,
    checkoutUserId?: string,
    checkoutCustomerId?: string,
  ): Promise<void> {
    const owned = await loadOwnedSubscription(
      subscriptionId,
      checkoutUserId,
      checkoutCustomerId,
    );
    if (!owned) {
      return;
    }
    const entitlement = await dependencies.store.reconcileSubscription({
      userId: owned.userId,
      subscription: owned.subscription,
      eventCreatedAt,
    });
    await dependencies.managedKeys.sync(entitlement);
  }

  async function reconcileSubscriptionFinancialState(input: {
    subscriptionId: string;
    financialState:
      | "paid"
      | "partially_refunded"
      | "fully_refunded"
      | "disputed";
    eventCreatedAt: Date;
  }): Promise<void> {
    const owned = await loadOwnedSubscription(input.subscriptionId);
    if (!owned) {
      return;
    }
    await dependencies.store.reconcileSubscription({
      userId: owned.userId,
      subscription: owned.subscription,
      eventCreatedAt: input.eventCreatedAt,
    });
    const entitlement = await dependencies.store.reconcileFinancialState({
      subscriptionId: input.subscriptionId,
      financialState: input.financialState,
      eventCreatedAt: input.eventCreatedAt,
    });
    await dependencies.managedKeys.sync(entitlement);
  }

  async function reconcilePaymentIntentFinancialState(input: {
    paymentIntentId: string;
    financialState:
      | "paid"
      | "partially_refunded"
      | "fully_refunded"
      | "disputed";
    eventCreatedAt: Date;
  }): Promise<void> {
    const subscriptionId =
      await dependencies.stripe.resolveSubscriptionIdForPaymentIntent(
        input.paymentIntentId,
      );
    if (!subscriptionId) {
      return;
    }
    await reconcileSubscriptionFinancialState({
      subscriptionId,
      financialState: input.financialState,
      eventCreatedAt: input.eventCreatedAt,
    });
  }

  function expandableId(value: z.infer<typeof expandableIdSchema>): string {
    return typeof value === "string" ? value : value.id;
  }

  async function handleEvent(event: StripeSdk.Event): Promise<void> {
    const eventCreatedAt = new Date(event.created * 1000);
    if (event.type === "checkout.session.completed") {
      const parsed = checkoutSessionSchema.safeParse(event.data.object);
      if (
        !parsed.success ||
        parsed.data.client_reference_id !==
          parsed.data.metadata.launchstack_user_id
      ) {
        throw new BillingEventProcessingError();
      }
      await reconcileSubscription(
        expandableId(parsed.data.subscription),
        eventCreatedAt,
        parsed.data.metadata.launchstack_user_id,
        expandableId(parsed.data.customer),
      );
      return;
    }

    if (isSubscriptionEvent(event.type)) {
      const parsed = subscriptionEventObjectSchema.safeParse(event.data.object);
      if (!parsed.success) {
        throw new BillingEventProcessingError();
      }
      await reconcileSubscription(parsed.data.id, eventCreatedAt);
      return;
    }

    if (event.type === "charge.refunded") {
      const parsed = chargeRefundedSchema.safeParse(event.data.object);
      if (!parsed.success || !parsed.data.payment_intent) {
        return;
      }
      await reconcilePaymentIntentFinancialState({
        paymentIntentId: expandableId(parsed.data.payment_intent),
        financialState:
          parsed.data.amount_refunded >= parsed.data.amount
            ? "fully_refunded"
            : "partially_refunded",
        eventCreatedAt,
      });
      return;
    }

    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.closed"
    ) {
      const parsed = disputeSchema.safeParse(event.data.object);
      if (!parsed.success || !parsed.data.payment_intent) {
        return;
      }
      const restored =
        event.type === "charge.dispute.closed" &&
        (parsed.data.status === "won" ||
          parsed.data.status === "prevented" ||
          parsed.data.status === "warning_closed");
      await reconcilePaymentIntentFinancialState({
        paymentIntentId: expandableId(parsed.data.payment_intent),
        financialState: restored ? "paid" : "disputed",
        eventCreatedAt,
      });
      return;
    }

    if (event.type === "invoice.paid") {
      const parsed = paidInvoiceSchema.safeParse(event.data.object);
      const subscription = parsed.success
        ? parsed.data.parent?.subscription_details?.subscription
        : null;
      if (!subscription) {
        return;
      }
      await reconcileSubscriptionFinancialState({
        subscriptionId: expandableId(subscription),
        financialState: "paid",
        eventCreatedAt,
      });
    }
  }

  return {
    async process(event: StripeSdk.Event): Promise<{ duplicate: boolean }> {
      const claim = await dependencies.store.claimEvent({
        id: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      });
      if (claim === "duplicate") {
        return { duplicate: true };
      }
      if (claim === "busy") {
        throw new BillingEventProcessingError();
      }

      try {
        await handleEvent(event);
        await dependencies.store.markEventProcessed(event.id);
        return { duplicate: false };
      } catch {
        await dependencies.store.markEventFailed(event.id, "processing_failed");
        throw new BillingEventProcessingError();
      }
    },
  };
}
