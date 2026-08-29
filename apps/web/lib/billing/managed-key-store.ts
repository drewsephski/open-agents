import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { billingEntitlements, managedInferenceKeys } from "@/lib/db/schema";
import type {
  ManagedInferenceKeyStore,
  StoredManagedInferenceKey,
} from "./managed-key-lifecycle";

const KEY_OPERATION_LEASE_MS = 5 * 60 * 1000;

function toStoredManagedInferenceKey(
  row: typeof managedInferenceKeys.$inferSelect,
): StoredManagedInferenceKey {
  const envelope =
    row.ciphertext &&
    row.nonce &&
    row.authenticationTag &&
    row.encryptionKeyVersion !== null
      ? {
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          authenticationTag: row.authenticationTag,
          encryptionKeyVersion: row.encryptionKeyVersion,
        }
      : null;
  return {
    id: row.id,
    userId: row.userId,
    entitlementId: row.entitlementId,
    providerKeyId: row.providerKeyId,
    lifecycleState: row.lifecycleState,
    label: row.label,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    envelope,
    provisioningErrorCode: row.provisioningErrorCode,
  };
}

function claimFromRow(row: typeof managedInferenceKeys.$inferSelect) {
  if (!row.claimToken) {
    throw new Error("Managed key operation claim is missing");
  }
  return { token: row.claimToken, generation: row.claimGeneration };
}

export const managedInferenceKeyStore: ManagedInferenceKeyStore = {
  async listForUser(userId) {
    const rows = await db
      .select()
      .from(managedInferenceKeys)
      .where(eq(managedInferenceKeys.userId, userId));
    return rows.map(toStoredManagedInferenceKey);
  },

  async beginProvisioning(input) {
    const now = new Date();
    const claimToken = nanoid();
    const leaseExpiresAt = new Date(now.getTime() + KEY_OPERATION_LEASE_MS);
    const baseValues = {
      userId: input.userId,
      entitlementId: input.entitlementId,
      label: input.label,
      lifecycleState: "provisioning" as const,
      spendLimitMicros: 10_000_000,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      providerKeyId: null,
      ciphertext: null,
      nonce: null,
      authenticationTag: null,
      encryptionKeyVersion: null,
      keyHash: null,
      provisioningErrorCode: null,
      claimToken,
      leaseExpiresAt,
      revokedAt: null,
      updatedAt: now,
    };
    const [inserted] = await db
      .insert(managedInferenceKeys)
      .values({ id: input.id, ...baseValues, claimGeneration: 1 })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      return {
        state: "claimed",
        record: toStoredManagedInferenceKey(inserted),
        claim: claimFromRow(inserted),
      };
    }

    const [reclaimed] = await db
      .update(managedInferenceKeys)
      .set({
        ...baseValues,
        claimGeneration: sql`${managedInferenceKeys.claimGeneration} + 1`,
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.userId, input.userId),
          or(
            eq(managedInferenceKeys.lifecycleState, "failed"),
            eq(managedInferenceKeys.lifecycleState, "revoked"),
            and(
              eq(managedInferenceKeys.lifecycleState, "provisioning"),
              or(
                isNull(managedInferenceKeys.leaseExpiresAt),
                lt(managedInferenceKeys.leaseExpiresAt, now),
              ),
            ),
          ),
        ),
      )
      .returning();
    if (reclaimed) {
      return {
        state: "claimed",
        record: toStoredManagedInferenceKey(reclaimed),
        claim: claimFromRow(reclaimed),
      };
    }

    const [existing] = await db
      .select({ userId: managedInferenceKeys.userId })
      .from(managedInferenceKeys)
      .where(eq(managedInferenceKeys.id, input.id))
      .limit(1);
    if (!existing || existing.userId !== input.userId) {
      throw new Error("Managed key ownership conflict");
    }
    return { state: "busy" };
  },

  async shouldKeyRemainActive(key) {
    if (!key.entitlementId) {
      return false;
    }
    const [entitlement] = await db
      .select({
        userId: billingEntitlements.userId,
        state: billingEntitlements.state,
        periodStart: billingEntitlements.periodStart,
        periodEnd: billingEntitlements.periodEnd,
      })
      .from(billingEntitlements)
      .where(eq(billingEntitlements.id, key.entitlementId))
      .limit(1);
    return (
      entitlement?.userId === key.userId &&
      entitlement.state === "active" &&
      entitlement.periodStart?.getTime() === key.periodStart.getTime() &&
      entitlement.periodEnd?.getTime() === key.periodEnd.getTime()
    );
  },

  async activate(input) {
    const [row] = await db
      .update(managedInferenceKeys)
      .set({
        providerKeyId: input.providerKeyId,
        ciphertext: input.envelope.ciphertext,
        nonce: input.envelope.nonce,
        authenticationTag: input.envelope.authenticationTag,
        encryptionKeyVersion: input.envelope.encryptionKeyVersion,
        keyHash: input.keyHash,
        lifecycleState: "active",
        claimToken: null,
        leaseExpiresAt: null,
        provisioningErrorCode: null,
        provisionedAt: new Date(),
        rotatedAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.lifecycleState, "provisioning"),
          eq(managedInferenceKeys.claimToken, input.claim.token),
          eq(managedInferenceKeys.claimGeneration, input.claim.generation),
        ),
      )
      .returning({ id: managedInferenceKeys.id });
    return Boolean(row);
  },

  async discardProvisioning(input) {
    const [row] = await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "revoked",
        providerKeyId: null,
        ciphertext: null,
        nonce: null,
        authenticationTag: null,
        encryptionKeyVersion: null,
        keyHash: null,
        claimToken: null,
        leaseExpiresAt: null,
        provisioningErrorCode: null,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.lifecycleState, "provisioning"),
          eq(managedInferenceKeys.claimToken, input.claim.token),
          eq(managedInferenceKeys.claimGeneration, input.claim.generation),
        ),
      )
      .returning({ id: managedInferenceKeys.id });
    return Boolean(row);
  },

  async claimRevocation(key) {
    if (key.lifecycleState === "revoked") {
      return { state: "revoked" };
    }
    const now = new Date();
    const claimToken = nanoid();
    const [claimed] = await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "revoking",
        claimToken,
        claimGeneration: sql`${managedInferenceKeys.claimGeneration} + 1`,
        leaseExpiresAt: new Date(now.getTime() + KEY_OPERATION_LEASE_MS),
        updatedAt: now,
      })
      .where(
        and(
          eq(managedInferenceKeys.id, key.id),
          eq(managedInferenceKeys.userId, key.userId),
          or(
            eq(managedInferenceKeys.lifecycleState, "active"),
            eq(managedInferenceKeys.lifecycleState, "failed"),
            and(
              eq(managedInferenceKeys.lifecycleState, "revoking"),
              or(
                isNull(managedInferenceKeys.leaseExpiresAt),
                lt(managedInferenceKeys.leaseExpiresAt, now),
              ),
            ),
          ),
        ),
      )
      .returning();
    if (!claimed) {
      const [current] = await db
        .select({ lifecycleState: managedInferenceKeys.lifecycleState })
        .from(managedInferenceKeys)
        .where(
          and(
            eq(managedInferenceKeys.id, key.id),
            eq(managedInferenceKeys.userId, key.userId),
          ),
        )
        .limit(1);
      return {
        state: current?.lifecycleState === "revoked" ? "revoked" : "busy",
      };
    }
    return { state: "claimed", claim: claimFromRow(claimed) };
  },

  async finishRevocation(input) {
    const [row] = await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "revoked",
        providerKeyId: null,
        ciphertext: null,
        nonce: null,
        authenticationTag: null,
        encryptionKeyVersion: null,
        keyHash: null,
        claimToken: null,
        leaseExpiresAt: null,
        provisioningErrorCode: null,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.lifecycleState, "revoking"),
          eq(managedInferenceKeys.claimToken, input.claim.token),
          eq(managedInferenceKeys.claimGeneration, input.claim.generation),
        ),
      )
      .returning({ id: managedInferenceKeys.id });
    return Boolean(row);
  },

  async releaseRevocation(input) {
    const [row] = await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "active",
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.lifecycleState, "revoking"),
          eq(managedInferenceKeys.claimToken, input.claim.token),
          eq(managedInferenceKeys.claimGeneration, input.claim.generation),
        ),
      )
      .returning({ id: managedInferenceKeys.id });
    return Boolean(row);
  },

  async markFailed(input) {
    const [row] = await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "failed",
        claimToken: null,
        leaseExpiresAt: null,
        provisioningErrorCode: input.errorCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          or(
            eq(managedInferenceKeys.lifecycleState, "provisioning"),
            eq(managedInferenceKeys.lifecycleState, "revoking"),
          ),
          eq(managedInferenceKeys.claimToken, input.claim.token),
          eq(managedInferenceKeys.claimGeneration, input.claim.generation),
        ),
      )
      .returning({ id: managedInferenceKeys.id });
    return Boolean(row);
  },
};
