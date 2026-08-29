import "server-only";
import { and, eq, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { managedInferenceKeys } from "@/lib/db/schema";
import type {
  ManagedInferenceKeyStore,
  StoredManagedInferenceKey,
} from "./managed-key-lifecycle";

const PROVISIONING_LEASE_MS = 5 * 60 * 1000;

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
    const values = {
      id: input.id,
      userId: input.userId,
      entitlementId: input.entitlementId,
      label: input.label,
      lifecycleState: "provisioning" as const,
      spendLimitMicros: 10_000_000,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      provisioningErrorCode: null,
      updatedAt: now,
    };
    const [inserted] = await db
      .insert(managedInferenceKeys)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      return {
        record: toStoredManagedInferenceKey(inserted),
        claimed: true,
      };
    }

    const leaseCutoff = new Date(now.getTime() - PROVISIONING_LEASE_MS);
    const [reclaimed] = await db
      .update(managedInferenceKeys)
      .set(values)
      .where(
        and(
          eq(managedInferenceKeys.id, input.id),
          eq(managedInferenceKeys.userId, input.userId),
          or(
            eq(managedInferenceKeys.lifecycleState, "failed"),
            eq(managedInferenceKeys.lifecycleState, "revoked"),
            and(
              eq(managedInferenceKeys.lifecycleState, "provisioning"),
              lt(managedInferenceKeys.updatedAt, leaseCutoff),
            ),
          ),
        ),
      )
      .returning();
    if (reclaimed) {
      if (reclaimed.userId !== input.userId) {
        throw new Error("Managed key ownership conflict");
      }
      return {
        record: toStoredManagedInferenceKey(reclaimed),
        claimed: true,
      };
    }

    const [existing] = await db
      .select()
      .from(managedInferenceKeys)
      .where(eq(managedInferenceKeys.id, input.id))
      .limit(1);
    if (!existing || existing.userId !== input.userId) {
      throw new Error("Managed key ownership conflict");
    }
    return {
      record: toStoredManagedInferenceKey(existing),
      claimed: false,
    };
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
        provisioningErrorCode: null,
        provisionedAt: new Date(),
        rotatedAt: new Date(),
        revokedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(managedInferenceKeys.id, input.id))
      .returning({ id: managedInferenceKeys.id });
    if (!row) {
      throw new Error("Managed key activation target is missing");
    }
  },

  async markFailed(id, errorCode) {
    await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "failed",
        provisioningErrorCode: errorCode,
        updatedAt: new Date(),
      })
      .where(eq(managedInferenceKeys.id, id));
  },

  async markRevoking(id) {
    await db
      .update(managedInferenceKeys)
      .set({ lifecycleState: "revoking", updatedAt: new Date() })
      .where(eq(managedInferenceKeys.id, id));
  },

  async markRevoked(id) {
    await db
      .update(managedInferenceKeys)
      .set({
        lifecycleState: "revoked",
        ciphertext: null,
        nonce: null,
        authenticationTag: null,
        encryptionKeyVersion: null,
        provisioningErrorCode: null,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(managedInferenceKeys.id, id));
  },
};
