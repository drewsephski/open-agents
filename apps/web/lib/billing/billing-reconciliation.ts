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

const subscriptionInvoiceSchema = z.object({
  id: z.string().min(1),
  object: z.literal("invoice"),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]).nullable(),
  parent: z
    .object({
      subscription_details: z
        .object({ subscription: expandableIdSchema })
        .nullable(),
    })
    .nullable(),
  lines: z.object({
    data: z.array(
      z.object({
        period: z.object({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
        }),
        pricing: z
          .object({
            type: z.literal("price_details"),
            price_details: z.object({ price: expandableIdSchema }),
          })
          .nullable(),
      }),
    ),
  }),
});

type FinancialState =
  | "unpaid"
  | "paid"
  | "partially_refunded"
  | "fully_refunded"
  | "disputed";

export interface StripeBillingPeriod {
  start: Date;
  end: Date;
}

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
  claimEvent(event: { id: string; type: string; createdAt: Date }): Promise<
    | { state: "duplicate" }
    | { state: "busy" }
    | {
        state: "claimed";
        claim: { eventId: string; token: string; generation: number };
      }
  >;
  markEventProcessed(claim: {
    eventId: string;
    token: string;
    generation: number;
  }): Promise<boolean>;
  markEventFailed(input: {
    claim: { eventId: string; token: string; generation: number };
    errorCode: string;
  }): Promise<boolean>;
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
    financialState: FinancialState;
    period: StripeBillingPeriod;
    eventCreatedAt: Date;
    eventId: string;
  }): Promise<ManagedEntitlementState>;
}

interface BillingEventProcessorDependencies {
  proPriceId: string;
  store: BillingEventStore;
  stripe: {
    retrieveSubscription(
      subscriptionId: string,
    ): Promise<StripeSubscriptionSnapshot>;
    resolveSubscriptionPeriodForPaymentIntent(
      paymentIntentId: string,
    ): Promise<{
      subscriptionId: string;
      period: StripeBillingPeriod;
    } | null>;
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
    type === "customer.subscription.deleted" ||
    type === "customer.subscription.paused" ||
    type === "customer.subscription.resumed"
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
    financialState: FinancialState;
    period: StripeBillingPeriod;
    eventCreatedAt: Date;
    eventId: string;
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
      period: input.period,
      eventCreatedAt: input.eventCreatedAt,
      eventId: input.eventId,
    });
    await dependencies.managedKeys.sync(entitlement);
  }

  async function reconcilePaymentIntentFinancialState(input: {
    paymentIntentId: string;
    financialState: FinancialState;
    eventCreatedAt: Date;
    eventId: string;
  }): Promise<void> {
    const target =
      await dependencies.stripe.resolveSubscriptionPeriodForPaymentIntent(
        input.paymentIntentId,
      );
    if (!target) {
      return;
    }
    await reconcileSubscriptionFinancialState({
      subscriptionId: target.subscriptionId,
      financialState: input.financialState,
      period: target.period,
      eventCreatedAt: input.eventCreatedAt,
      eventId: input.eventId,
    });
  }

  function expandableId(value: z.infer<typeof expandableIdSchema>): string {
    return typeof value === "string" ? value : value.id;
  }

  function subscriptionInvoiceTarget(object: unknown) {
    const parsed = subscriptionInvoiceSchema.safeParse(object);
    const subscription = parsed.success
      ? parsed.data.parent?.subscription_details?.subscription
      : null;
    if (!parsed.success || !subscription) {
      return null;
    }
    const line = parsed.data.lines.data.find(
      (candidate) =>
        candidate.pricing?.type === "price_details" &&
        expandableId(candidate.pricing.price_details.price) ===
          dependencies.proPriceId,
    );
    if (!line) {
      return null;
    }
    return {
      invoice: parsed.data,
      subscriptionId: expandableId(subscription),
      period: {
        start: new Date(line.period.start * 1000),
        end: new Date(line.period.end * 1000),
      },
    };
  }

  async function handleEvent(event: StripeSdk.Event): Promise<void> {
    const eventCreatedAt = new Date(event.created * 1000);
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const parsed = checkoutSessionSchema.safeParse(event.data.object);
      if (
        !parsed.success ||
        parsed.data.client_reference_id !==
          parsed.data.metadata.launchstack_user_id
      ) {
        throw new BillingEventProcessingError();
      }
      const subscriptionId = expandableId(parsed.data.subscription);
      const checkoutUserId = parsed.data.metadata.launchstack_user_id;
      const checkoutCustomerId = expandableId(parsed.data.customer);
      if (event.type === "checkout.session.async_payment_failed") {
        const owned = await loadOwnedSubscription(
          subscriptionId,
          checkoutUserId,
          checkoutCustomerId,
        );
        if (!owned) {
          return;
        }
        await dependencies.store.reconcileSubscription({
          userId: owned.userId,
          subscription: owned.subscription,
          eventCreatedAt,
        });
        const entitlement = await dependencies.store.reconcileFinancialState({
          subscriptionId,
          financialState: "unpaid",
          period: {
            start: owned.subscription.periodStart,
            end: owned.subscription.periodEnd,
          },
          eventCreatedAt,
          eventId: event.id,
        });
        await dependencies.managedKeys.sync(entitlement);
      } else {
        await reconcileSubscription(
          subscriptionId,
          eventCreatedAt,
          checkoutUserId,
          checkoutCustomerId,
        );
      }
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
        eventId: event.id,
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
        eventId: event.id,
      });
      return;
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.voided" ||
      event.type === "invoice.finalization_failed" ||
      event.type === "invoice.marked_uncollectible"
    ) {
      const target = subscriptionInvoiceTarget(event.data.object);
      if (!target) {
        return;
      }
      await reconcileSubscriptionFinancialState({
        subscriptionId: target.subscriptionId,
        financialState:
          event.type === "invoice.paid" && target.invoice.status === "paid"
            ? "paid"
            : "unpaid",
        period: target.period,
        eventCreatedAt,
        eventId: event.id,
      });
    }
  }

  return {
    async process(event: StripeSdk.Event): Promise<{ duplicate: boolean }> {
      const receipt = await dependencies.store.claimEvent({
        id: event.id,
        type: event.type,
        createdAt: new Date(event.created * 1000),
      });
      if (receipt.state === "duplicate") {
        return { duplicate: true };
      }
      if (receipt.state === "busy") {
        throw new BillingEventProcessingError();
      }

      try {
        await handleEvent(event);
        const completed = await dependencies.store.markEventProcessed(
          receipt.claim,
        );
        if (!completed) {
          throw new BillingEventProcessingError();
        }
        return { duplicate: false };
      } catch {
        await dependencies.store.markEventFailed({
          claim: receipt.claim,
          errorCode: "processing_failed",
        });
        throw new BillingEventProcessingError();
      }
    },
  };
}
