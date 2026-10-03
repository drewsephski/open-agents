import "server-only";
import { z } from "zod";
import type {
  SubscriptionStatus,
  FinancialState,
} from "@/lib/access/subscription-state";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";
import type { createBillingStateStore } from "./billing-state-store";

export interface BillingPeriod {
  start: Date;
  end: Date;
}
export interface SubscriptionSnapshot {
  id: string;
  providerCustomerId: string;
  providerProductId: string;
  providerPriceId: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  periodStart: Date;
  periodEnd: Date;
  canceledAt: Date | null;
  metadataUserId: string | null;
}
type EventStore = Pick<
  ReturnType<typeof createBillingStateStore>,
  | "claimEvent"
  | "markEventProcessed"
  | "markEventFailed"
  | "getUserIdForProviderCustomer"
  | "linkCustomer"
  | "reconcileSubscription"
  | "reconcileFinancialState"
  | "hasCheckoutForUser"
>;
const eventSchema = z
  .object({
    webhookId: z.string().min(1),
    webhookEventType: z.string().min(1),
    webhookCreatedAt: z.number().int().positive(),
    id: z.string().min(1),
  })
  .passthrough();
const referenceSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).passthrough(),
]);
const periodSchema = z.object({
  current_period_start_date: z.iso.datetime(),
  current_period_end_date: z.iso.datetime(),
});
const transactionSchema = z
  .object({
    subscription: referenceSchema,
    period_start: z.number().int().positive(),
    period_end: z.number().int().positive(),
    amount_paid: z.number().int().positive(),
    refunded_amount: z.number().int().nonnegative().optional(),
  })
  .passthrough();
function referenceId(value: z.infer<typeof referenceSchema>): string {
  return typeof value === "string" ? value : value.id;
}
export class BillingEventProcessingError extends Error {
  constructor() {
    super("billing_event_processing_failed");
    this.name = "BillingEventProcessingError";
  }
}
export function createBillingEventProcessor(dependencies: {
  proProductId: string;
  store: EventStore;
  provider: { retrieveSubscription(id: string): Promise<SubscriptionSnapshot> };
  managedKeys: { sync(entitlement: ManagedEntitlementState): Promise<void> };
}) {
  async function loadOwned(id: string, expectedUserId?: string) {
    const subscription = await dependencies.provider.retrieveSubscription(id);
    if (subscription.providerProductId !== dependencies.proProductId)
      return null;
    const owner = await dependencies.store.getUserIdForProviderCustomer(
      subscription.providerCustomerId,
    );
    const candidate = subscription.metadataUserId ?? owner;
    if (!candidate) return null;
    if (expectedUserId && candidate !== expectedUserId)
      throw new BillingEventProcessingError();
    if (owner && owner !== candidate) throw new BillingEventProcessingError();
    if (
      !owner &&
      !(await dependencies.store.hasCheckoutForUser(
        candidate,
        dependencies.proProductId,
      ))
    )
      return null;
    await dependencies.store.linkCustomer({
      userId: candidate,
      providerCustomerId: subscription.providerCustomerId,
    });
    return { subscription, userId: candidate };
  }
  async function reconcile(input: {
    id: string;
    expectedUserId?: string;
    eventCreatedAt: Date;
    financial?: {
      state: FinancialState;
      period: BillingPeriod;
      eventId: string;
    };
  }) {
    const owned = await loadOwned(input.id, input.expectedUserId);
    if (!owned) return;
    let entitlement = await dependencies.store.reconcileSubscription({
      ...owned,
      eventCreatedAt: input.eventCreatedAt,
    });
    if (input.financial)
      entitlement = await dependencies.store.reconcileFinancialState({
        subscriptionId: owned.subscription.id,
        financialState: input.financial.state,
        period: input.financial.period,
        eventCreatedAt: input.eventCreatedAt,
        eventId: input.financial.eventId,
      });
    await dependencies.managedKeys.sync(entitlement);
  }
  async function handle(event: z.infer<typeof eventSchema>) {
    const eventCreatedAt = new Date(event.webhookCreatedAt);
    if (event.webhookEventType === "checkout.completed") {
      const subscription = referenceSchema.safeParse(event.subscription);
      if (subscription.success)
        await reconcile({ id: referenceId(subscription.data), eventCreatedAt });
      return;
    }
    if (event.webhookEventType.startsWith("subscription.")) {
      const financialType =
        event.webhookEventType === "subscription.paid"
          ? "paid"
          : [
                "subscription.unpaid",
                "subscription.past_due",
                "subscription.expired",
              ].includes(event.webhookEventType)
            ? "unpaid"
            : null;
      const period = financialType ? periodSchema.parse(event) : null;
      if (
        period &&
        new Date(period.current_period_end_date) <=
          new Date(period.current_period_start_date)
      )
        throw new BillingEventProcessingError();
      await reconcile({
        id: event.id,
        eventCreatedAt,
        ...(period && financialType
          ? {
              financial: {
                state: financialType,
                period: {
                  start: new Date(period.current_period_start_date),
                  end: new Date(period.current_period_end_date),
                },
                eventId: event.webhookId,
              },
            }
          : {}),
      });
      return;
    }
    if (
      event.webhookEventType === "refund.created" ||
      event.webhookEventType === "dispute.created"
    ) {
      if (
        event.webhookEventType === "refund.created" &&
        event.status !== "succeeded"
      )
        return;
      const transaction = transactionSchema.parse(event.transaction);
      if (transaction.period_end <= transaction.period_start)
        throw new BillingEventProcessingError();
      const state: FinancialState =
        event.webhookEventType === "dispute.created"
          ? "disputed"
          : (transaction.refunded_amount ?? 0) >= transaction.amount_paid
            ? "fully_refunded"
            : "partially_refunded";
      await reconcile({
        id: referenceId(transaction.subscription),
        eventCreatedAt,
        financial: {
          state,
          period: {
            start: new Date(transaction.period_start),
            end: new Date(transaction.period_end),
          },
          eventId: event.webhookId,
        },
      });
    }
  }
  return {
    // Only call with payment evidence retrieved using the server's Creem key.
    async reconcileVerifiedPayment(input: {
      userId: string;
      subscriptionId: string;
      transactionId: string;
      paidAt: Date;
      period: BillingPeriod;
      financialState: FinancialState;
    }): Promise<void> {
      await reconcile({
        id: input.subscriptionId,
        expectedUserId: input.userId,
        eventCreatedAt: input.paidAt,
        financial: {
          state: input.financialState,
          period: input.period,
          eventId: `creem_transaction_${input.transactionId}`,
        },
      });
    },
    async process(input: unknown): Promise<{ duplicate: boolean }> {
      const event = eventSchema.parse(input);
      const receipt = await dependencies.store.claimEvent({
        id: event.webhookId,
        type: event.webhookEventType,
        createdAt: new Date(event.webhookCreatedAt),
      });
      if (receipt.state === "duplicate") return { duplicate: true };
      if (receipt.state === "busy") throw new BillingEventProcessingError();
      try {
        await handle(event);
        if (!(await dependencies.store.markEventProcessed(receipt.claim)))
          throw new BillingEventProcessingError();
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
