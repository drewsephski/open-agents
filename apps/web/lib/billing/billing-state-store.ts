import "server-only";
import { and, eq, lt, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  billingCustomers,
  billingEntitlements,
  billingSubscriptions,
  billingWebhookReceipts,
} from "@/lib/db/schema";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";

const EVENT_PROCESSING_LEASE_MS = 5 * 60 * 1000;

function toManagedEntitlementState(row: {
  id: string;
  userId: string;
  state: "active" | "inactive";
  periodStart: Date | null;
  periodEnd: Date | null;
}): ManagedEntitlementState {
  if (!(row.periodStart && row.periodEnd)) {
    throw new Error("Managed entitlement period is missing");
  }
  return {
    id: row.id,
    userId: row.userId,
    state: row.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
  };
}

export const billingStateStore = {
  async claimEvent(event: { id: string; type: string; createdAt: Date }) {
    const now = new Date();
    const [inserted] = await db
      .insert(billingWebhookReceipts)
      .values({
        stripeEventId: event.id,
        eventType: event.type,
        eventCreatedAt: event.createdAt,
        processingState: "processing",
        receivedAt: now,
      })
      .onConflictDoNothing()
      .returning({ stripeEventId: billingWebhookReceipts.stripeEventId });
    if (inserted) {
      return "claimed" as const;
    }

    const [receipt] = await db
      .select({ processingState: billingWebhookReceipts.processingState })
      .from(billingWebhookReceipts)
      .where(eq(billingWebhookReceipts.stripeEventId, event.id))
      .limit(1);
    if (receipt?.processingState === "processed") {
      return "duplicate" as const;
    }

    const leaseCutoff = new Date(now.getTime() - EVENT_PROCESSING_LEASE_MS);
    const [reclaimed] = await db
      .update(billingWebhookReceipts)
      .set({
        processingState: "processing",
        processingErrorCode: null,
        receivedAt: now,
        processedAt: null,
      })
      .where(
        and(
          eq(billingWebhookReceipts.stripeEventId, event.id),
          or(
            eq(billingWebhookReceipts.processingState, "failed"),
            and(
              eq(billingWebhookReceipts.processingState, "processing"),
              lt(billingWebhookReceipts.receivedAt, leaseCutoff),
            ),
          ),
        ),
      )
      .returning({ stripeEventId: billingWebhookReceipts.stripeEventId });
    return reclaimed ? ("claimed" as const) : ("busy" as const);
  },

  async markEventProcessed(eventId: string) {
    await db
      .update(billingWebhookReceipts)
      .set({
        processingState: "processed",
        processingErrorCode: null,
        processedAt: new Date(),
      })
      .where(eq(billingWebhookReceipts.stripeEventId, eventId));
  },

  async markEventFailed(eventId: string, errorCode: string) {
    await db
      .update(billingWebhookReceipts)
      .set({
        processingState: "failed",
        processingErrorCode: errorCode,
        processedAt: null,
      })
      .where(eq(billingWebhookReceipts.stripeEventId, eventId));
  },

  async getUserIdForStripeCustomer(stripeCustomerId: string) {
    const [customer] = await db
      .select({ userId: billingCustomers.userId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
      .limit(1);
    return customer?.userId ?? null;
  },

  async linkCustomer(input: { userId: string; stripeCustomerId: string }) {
    await db.transaction(async (tx) => {
      const [byUser] = await tx
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.userId, input.userId))
        .limit(1)
        .for("update");
      const [byStripeCustomer] = await tx
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.stripeCustomerId, input.stripeCustomerId))
        .limit(1)
        .for("update");
      if (
        (byUser && byUser.stripeCustomerId !== input.stripeCustomerId) ||
        (byStripeCustomer && byStripeCustomer.userId !== input.userId)
      ) {
        throw new Error("Stripe customer ownership conflict");
      }
      if (byUser) {
        await tx
          .update(billingCustomers)
          .set({ updatedAt: new Date() })
          .where(eq(billingCustomers.id, byUser.id));
        return;
      }
      await tx.insert(billingCustomers).values({
        id: nanoid(),
        userId: input.userId,
        stripeCustomerId: input.stripeCustomerId,
      });
    });
  },

  async reconcileSubscription(input: {
    userId: string;
    subscription: {
      id: string;
      stripeCustomerId: string;
      stripeProductId: string;
      stripePriceId: string;
      status:
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused";
      cancelAtPeriodEnd: boolean;
      periodStart: Date;
      periodEnd: Date;
      canceledAt: Date | null;
    };
    eventCreatedAt: Date;
  }): Promise<ManagedEntitlementState> {
    return db.transaction(async (tx) => {
      const [existingSubscription] = await tx
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.id, input.subscription.id))
        .limit(1)
        .for("update");
      if (
        existingSubscription &&
        existingSubscription.userId !== input.userId
      ) {
        throw new Error("Stripe subscription ownership conflict");
      }

      const [existingEntitlement] = await tx
        .select()
        .from(billingEntitlements)
        .where(
          and(
            eq(billingEntitlements.userId, input.userId),
            eq(billingEntitlements.kind, "managed_openrouter"),
          ),
        )
        .limit(1)
        .for("update");
      if (
        existingSubscription &&
        input.eventCreatedAt < existingSubscription.latestEventCreatedAt &&
        existingEntitlement
      ) {
        return toManagedEntitlementState(existingEntitlement);
      }

      const financialState = existingSubscription?.financialState ?? "paid";
      const entitlementState =
        input.subscription.status === "active" &&
        (financialState === "paid" || financialState === "partially_refunded")
          ? "active"
          : "inactive";
      const now = new Date();

      await tx
        .insert(billingSubscriptions)
        .values({
          id: input.subscription.id,
          userId: input.userId,
          stripeCustomerId: input.subscription.stripeCustomerId,
          stripeProductId: input.subscription.stripeProductId,
          stripePriceId: input.subscription.stripePriceId,
          status: input.subscription.status,
          financialState,
          cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
          currentPeriodStart: input.subscription.periodStart,
          currentPeriodEnd: input.subscription.periodEnd,
          canceledAt: input.subscription.canceledAt,
          latestEventCreatedAt: input.eventCreatedAt,
        })
        .onConflictDoUpdate({
          target: billingSubscriptions.id,
          set: {
            stripeCustomerId: input.subscription.stripeCustomerId,
            stripeProductId: input.subscription.stripeProductId,
            stripePriceId: input.subscription.stripePriceId,
            status: input.subscription.status,
            financialState,
            cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
            currentPeriodStart: input.subscription.periodStart,
            currentPeriodEnd: input.subscription.periodEnd,
            canceledAt: input.subscription.canceledAt,
            latestEventCreatedAt: input.eventCreatedAt,
            updatedAt: now,
          },
        });

      const entitlementId = existingEntitlement?.id ?? nanoid();
      const [entitlement] = await tx
        .insert(billingEntitlements)
        .values({
          id: entitlementId,
          userId: input.userId,
          subscriptionId: input.subscription.id,
          kind: "managed_openrouter",
          state: entitlementState,
          periodStart: input.subscription.periodStart,
          periodEnd: input.subscription.periodEnd,
          latestEventCreatedAt: input.eventCreatedAt,
        })
        .onConflictDoUpdate({
          target: [billingEntitlements.userId, billingEntitlements.kind],
          set: {
            subscriptionId: input.subscription.id,
            state: entitlementState,
            periodStart: input.subscription.periodStart,
            periodEnd: input.subscription.periodEnd,
            latestEventCreatedAt: input.eventCreatedAt,
            updatedAt: now,
          },
        })
        .returning();
      if (!entitlement) {
        throw new Error("Managed entitlement reconciliation failed");
      }
      return toManagedEntitlementState(entitlement);
    });
  },

  async reconcileFinancialState(input: {
    subscriptionId: string;
    financialState:
      | "paid"
      | "partially_refunded"
      | "fully_refunded"
      | "disputed";
    eventCreatedAt: Date;
  }): Promise<ManagedEntitlementState> {
    return db.transaction(async (tx) => {
      const [subscription] = await tx
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.id, input.subscriptionId))
        .limit(1)
        .for("update");
      if (!subscription) {
        throw new Error("Stripe subscription is missing");
      }
      const [entitlement] = await tx
        .select()
        .from(billingEntitlements)
        .where(
          and(
            eq(billingEntitlements.userId, subscription.userId),
            eq(billingEntitlements.kind, "managed_openrouter"),
            eq(billingEntitlements.subscriptionId, subscription.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!entitlement) {
        throw new Error("Managed entitlement is missing");
      }
      if (
        subscription.latestFinancialEventCreatedAt &&
        input.eventCreatedAt < subscription.latestFinancialEventCreatedAt
      ) {
        return toManagedEntitlementState(entitlement);
      }

      const entitlementState =
        subscription.status === "active" &&
        (input.financialState === "paid" ||
          input.financialState === "partially_refunded")
          ? "active"
          : "inactive";
      const now = new Date();
      await tx
        .update(billingSubscriptions)
        .set({
          financialState: input.financialState,
          latestFinancialEventCreatedAt: input.eventCreatedAt,
          updatedAt: now,
        })
        .where(eq(billingSubscriptions.id, subscription.id));
      const [updatedEntitlement] = await tx
        .update(billingEntitlements)
        .set({ state: entitlementState, updatedAt: now })
        .where(eq(billingEntitlements.id, entitlement.id))
        .returning();
      if (!updatedEntitlement) {
        throw new Error("Managed entitlement financial update failed");
      }
      return toManagedEntitlementState(updatedEntitlement);
    });
  },
};
