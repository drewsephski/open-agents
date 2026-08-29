import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db as productionDb } from "@/lib/db/client";
import {
  billingCustomers,
  billingEntitlements,
  billingSubscriptions,
  billingWebhookReceipts,
} from "@/lib/db/schema";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";
import type { StripeBillingPeriod } from "./billing-reconciliation";

const EVENT_PROCESSING_LEASE_MS = 5 * 60 * 1000;

function samePeriod(
  left: { start: Date | null; end: Date | null },
  right: StripeBillingPeriod,
): boolean {
  return (
    left.start?.getTime() === right.start.getTime() &&
    left.end?.getTime() === right.end.getTime()
  );
}

function isPaidPeriod(input: {
  financialState:
    | "unpaid"
    | "paid"
    | "partially_refunded"
    | "fully_refunded"
    | "disputed";
  paidPeriodStart: Date | null;
  paidPeriodEnd: Date | null;
  period: StripeBillingPeriod;
}): boolean {
  return (
    (input.financialState === "paid" ||
      input.financialState === "partially_refunded") &&
    samePeriod(
      { start: input.paidPeriodStart, end: input.paidPeriodEnd },
      input.period,
    )
  );
}

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

export function createBillingStateStore(
  database: typeof productionDb = productionDb,
) {
  return {
    async claimEvent(event: { id: string; type: string; createdAt: Date }) {
      const now = new Date();
      const claimToken = nanoid();
      const leaseExpiresAt = new Date(
        now.getTime() + EVENT_PROCESSING_LEASE_MS,
      );
      const [inserted] = await database
        .insert(billingWebhookReceipts)
        .values({
          stripeEventId: event.id,
          eventType: event.type,
          eventCreatedAt: event.createdAt,
          processingState: "processing",
          claimToken,
          claimGeneration: 1,
          leaseExpiresAt,
          receivedAt: now,
        })
        .onConflictDoNothing()
        .returning({
          stripeEventId: billingWebhookReceipts.stripeEventId,
          claimToken: billingWebhookReceipts.claimToken,
          claimGeneration: billingWebhookReceipts.claimGeneration,
        });
      if (inserted) {
        if (!inserted.claimToken) {
          throw new Error("Webhook receipt claim token is missing");
        }
        return {
          state: "claimed" as const,
          claim: {
            eventId: inserted.stripeEventId,
            token: inserted.claimToken,
            generation: inserted.claimGeneration,
          },
        };
      }

      const [receipt] = await database
        .select({ processingState: billingWebhookReceipts.processingState })
        .from(billingWebhookReceipts)
        .where(eq(billingWebhookReceipts.stripeEventId, event.id))
        .limit(1);
      if (receipt?.processingState === "processed") {
        return { state: "duplicate" as const };
      }

      const [reclaimed] = await database
        .update(billingWebhookReceipts)
        .set({
          processingState: "processing",
          processingErrorCode: null,
          claimToken,
          claimGeneration: sql`${billingWebhookReceipts.claimGeneration} + 1`,
          leaseExpiresAt,
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
                or(
                  isNull(billingWebhookReceipts.leaseExpiresAt),
                  lt(billingWebhookReceipts.leaseExpiresAt, now),
                ),
              ),
            ),
          ),
        )
        .returning({
          stripeEventId: billingWebhookReceipts.stripeEventId,
          claimToken: billingWebhookReceipts.claimToken,
          claimGeneration: billingWebhookReceipts.claimGeneration,
        });
      if (!reclaimed) {
        return { state: "busy" as const };
      }
      if (!reclaimed.claimToken) {
        throw new Error("Webhook receipt claim token is missing");
      }
      return {
        state: "claimed" as const,
        claim: {
          eventId: reclaimed.stripeEventId,
          token: reclaimed.claimToken,
          generation: reclaimed.claimGeneration,
        },
      };
    },

    async markEventProcessed(claim: {
      eventId: string;
      token: string;
      generation: number;
    }) {
      const [updated] = await database
        .update(billingWebhookReceipts)
        .set({
          processingState: "processed",
          processingErrorCode: null,
          claimToken: null,
          leaseExpiresAt: null,
          processedAt: new Date(),
        })
        .where(
          and(
            eq(billingWebhookReceipts.stripeEventId, claim.eventId),
            eq(billingWebhookReceipts.processingState, "processing"),
            eq(billingWebhookReceipts.claimToken, claim.token),
            eq(billingWebhookReceipts.claimGeneration, claim.generation),
          ),
        )
        .returning({ stripeEventId: billingWebhookReceipts.stripeEventId });
      return Boolean(updated);
    },

    async markEventFailed(input: {
      claim: { eventId: string; token: string; generation: number };
      errorCode: string;
    }) {
      const [updated] = await database
        .update(billingWebhookReceipts)
        .set({
          processingState: "failed",
          processingErrorCode: input.errorCode,
          claimToken: null,
          leaseExpiresAt: null,
          processedAt: null,
        })
        .where(
          and(
            eq(billingWebhookReceipts.stripeEventId, input.claim.eventId),
            eq(billingWebhookReceipts.processingState, "processing"),
            eq(billingWebhookReceipts.claimToken, input.claim.token),
            eq(billingWebhookReceipts.claimGeneration, input.claim.generation),
          ),
        )
        .returning({ stripeEventId: billingWebhookReceipts.stripeEventId });
      return Boolean(updated);
    },

    async getUserIdForStripeCustomer(stripeCustomerId: string) {
      const [customer] = await database
        .select({ userId: billingCustomers.userId })
        .from(billingCustomers)
        .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
        .limit(1);
      return customer?.userId ?? null;
    },

    async linkCustomer(input: { userId: string; stripeCustomerId: string }) {
      await database.transaction(async (tx) => {
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
      return database.transaction(async (tx) => {
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

        const subscriptionPeriod = {
          start: input.subscription.periodStart,
          end: input.subscription.periodEnd,
        };
        const periodUnchanged = existingSubscription
          ? samePeriod(
              {
                start: existingSubscription.currentPeriodStart,
                end: existingSubscription.currentPeriodEnd,
              },
              subscriptionPeriod,
            )
          : false;
        const financialState = periodUnchanged
          ? (existingSubscription?.financialState ?? "unpaid")
          : "unpaid";
        const paidPeriodStart = periodUnchanged
          ? (existingSubscription?.paidPeriodStart ?? null)
          : null;
        const paidPeriodEnd = periodUnchanged
          ? (existingSubscription?.paidPeriodEnd ?? null)
          : null;
        const entitlementState =
          input.subscription.status === "active" &&
          isPaidPeriod({
            financialState,
            paidPeriodStart,
            paidPeriodEnd,
            period: subscriptionPeriod,
          })
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
            paidPeriodStart,
            paidPeriodEnd,
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
              paidPeriodStart,
              paidPeriodEnd,
              latestFinancialEventCreatedAt: periodUnchanged
                ? existingSubscription?.latestFinancialEventCreatedAt
                : null,
              latestFinancialEventId: periodUnchanged
                ? existingSubscription?.latestFinancialEventId
                : null,
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
        | "unpaid"
        | "paid"
        | "partially_refunded"
        | "fully_refunded"
        | "disputed";
      period: StripeBillingPeriod;
      eventCreatedAt: Date;
      eventId: string;
    }): Promise<ManagedEntitlementState> {
      return database.transaction(async (tx) => {
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
          !samePeriod(
            {
              start: subscription.currentPeriodStart,
              end: subscription.currentPeriodEnd,
            },
            input.period,
          )
        ) {
          return toManagedEntitlementState(entitlement);
        }
        if (
          subscription.latestFinancialEventCreatedAt &&
          (input.eventCreatedAt < subscription.latestFinancialEventCreatedAt ||
            (input.eventCreatedAt.getTime() ===
              subscription.latestFinancialEventCreatedAt.getTime() &&
              subscription.latestFinancialEventId !== null &&
              input.eventId <= subscription.latestFinancialEventId))
        ) {
          return toManagedEntitlementState(entitlement);
        }

        const entitlementState =
          subscription.status === "active" &&
          isPaidPeriod({
            financialState: input.financialState,
            paidPeriodStart:
              input.financialState === "unpaid" ? null : input.period.start,
            paidPeriodEnd:
              input.financialState === "unpaid" ? null : input.period.end,
            period: input.period,
          })
            ? "active"
            : "inactive";
        const now = new Date();
        await tx
          .update(billingSubscriptions)
          .set({
            financialState: input.financialState,
            paidPeriodStart:
              input.financialState === "unpaid" ? null : input.period.start,
            paidPeriodEnd:
              input.financialState === "unpaid" ? null : input.period.end,
            latestFinancialEventCreatedAt: input.eventCreatedAt,
            latestFinancialEventId: input.eventId,
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
}

export const billingStateStore = createBillingStateStore();
