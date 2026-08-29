import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  billingCheckoutReservations,
  billingSubscriptions,
} from "@/lib/db/schema";
import type { BillingCheckoutStore } from "./billing-sessions";

const CHECKOUT_LEASE_MS = 5 * 60 * 1000;
const BLOCKING_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
] as const;

function storedSession(row: {
  stripeSessionId: string | null;
  sessionUrl: string | null;
  sessionExpiresAt: Date | null;
}) {
  return row.stripeSessionId && row.sessionUrl && row.sessionExpiresAt
    ? {
        id: row.stripeSessionId,
        url: row.sessionUrl,
        expiresAt: row.sessionExpiresAt,
      }
    : null;
}

export const billingCheckoutStore: BillingCheckoutStore = {
  async claimCheckout(userId) {
    return db.transaction(async (tx) => {
      const [subscription] = await tx
        .select({ id: billingSubscriptions.id })
        .from(billingSubscriptions)
        .where(
          and(
            eq(billingSubscriptions.userId, userId),
            inArray(
              billingSubscriptions.status,
              BLOCKING_SUBSCRIPTION_STATUSES,
            ),
          ),
        )
        .limit(1)
        .for("update");
      if (subscription) {
        return { state: "subscription_exists" as const };
      }

      await tx
        .insert(billingCheckoutReservations)
        .values({ userId, state: "failed", generation: 0 })
        .onConflictDoNothing();
      const [reservation] = await tx
        .select()
        .from(billingCheckoutReservations)
        .where(eq(billingCheckoutReservations.userId, userId))
        .limit(1)
        .for("update");
      if (!reservation) {
        throw new Error("Checkout reservation is missing");
      }

      const now = new Date();
      const existing = storedSession(reservation);
      if (
        reservation.state === "open" &&
        existing &&
        existing.expiresAt > now
      ) {
        return { state: "existing" as const, session: existing };
      }
      if (
        reservation.state === "creating" &&
        reservation.leaseExpiresAt &&
        reservation.leaseExpiresAt > now
      ) {
        return { state: "busy" as const };
      }

      const generation =
        reservation.state === "creating"
          ? reservation.generation
          : reservation.generation + 1;
      const token = nanoid();
      await tx
        .update(billingCheckoutReservations)
        .set({
          state: "creating",
          generation,
          claimToken: token,
          leaseExpiresAt: new Date(now.getTime() + CHECKOUT_LEASE_MS),
          stripeSessionId: null,
          sessionUrl: null,
          sessionExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(billingCheckoutReservations.userId, userId));
      return {
        state: "claimed" as const,
        claim: { token, generation },
      };
    });
  },

  async publishCheckout(input) {
    const [updated] = await db
      .update(billingCheckoutReservations)
      .set({
        state: "open",
        claimToken: null,
        leaseExpiresAt: null,
        stripeSessionId: input.session.id,
        sessionUrl: input.session.url,
        sessionExpiresAt: input.session.expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingCheckoutReservations.userId, input.userId),
          eq(billingCheckoutReservations.state, "creating"),
          eq(billingCheckoutReservations.generation, input.claim.generation),
          eq(billingCheckoutReservations.claimToken, input.claim.token),
        ),
      )
      .returning();
    if (updated) {
      return { accepted: true, currentSession: storedSession(updated) };
    }
    const [current] = await db
      .select()
      .from(billingCheckoutReservations)
      .where(eq(billingCheckoutReservations.userId, input.userId))
      .limit(1);
    return {
      accepted: false,
      currentSession: current ? storedSession(current) : null,
    };
  },

  async failCheckout(input) {
    const [updated] = await db
      .update(billingCheckoutReservations)
      .set({
        state: "failed",
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingCheckoutReservations.userId, input.userId),
          eq(billingCheckoutReservations.state, "creating"),
          eq(billingCheckoutReservations.generation, input.claim.generation),
          eq(billingCheckoutReservations.claimToken, input.claim.token),
        ),
      )
      .returning({ userId: billingCheckoutReservations.userId });
    return updated !== undefined;
  },
};
