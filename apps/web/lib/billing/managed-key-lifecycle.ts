import "server-only";
import { createHash } from "node:crypto";
import type { CredentialEnvelope } from "@/lib/credentials/envelope-encryption";
import type { OpenRouterManagementClient } from "./openrouter-management";

export interface ManagedEntitlementState {
  id: string;
  userId: string;
  state: "active" | "inactive";
  periodStart: Date;
  periodEnd: Date;
}

export interface StoredManagedInferenceKey {
  id: string;
  userId: string;
  entitlementId: string | null;
  providerKeyId: string | null;
  lifecycleState: "provisioning" | "active" | "failed" | "revoking" | "revoked";
  label: string;
  periodStart: Date;
  periodEnd: Date;
  envelope: CredentialEnvelope | null;
  provisioningErrorCode: string | null;
}

export interface ManagedInferenceKeyStore {
  listForUser(userId: string): Promise<StoredManagedInferenceKey[]>;
  beginProvisioning(input: {
    id: string;
    userId: string;
    entitlementId: string;
    label: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<{ record: StoredManagedInferenceKey; claimed: boolean }>;
  activate(input: {
    id: string;
    providerKeyId: string;
    keyHash: string;
    envelope: CredentialEnvelope;
  }): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
  markRevoking(id: string): Promise<void>;
  markRevoked(id: string): Promise<void>;
}

interface ManagedKeyLifecycleDependencies {
  store: ManagedInferenceKeyStore;
  managementClient: OpenRouterManagementClient;
  encrypt(
    plaintext: string,
    context: { userId: string; source: "managed" },
  ): CredentialEnvelope;
}

export class ManagedKeyLifecycleError extends Error {
  constructor(
    code:
      | "managed_key_provisioning_failed"
      | "managed_key_provisioning_in_progress"
      | "managed_key_revocation_failed",
  ) {
    super(code);
    this.name = "ManagedKeyLifecycleError";
  }
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getManagedKeyIdentity(entitlement: ManagedEntitlementState) {
  const periodIso = entitlement.periodStart.toISOString();
  const userHash = stableHash(entitlement.userId).slice(0, 12);
  return {
    id: `managed_${stableHash(`${entitlement.userId}|${periodIso}`).slice(0, 32)}`,
    label: `Launchstack managed ${userHash} ${periodIso.slice(0, 10)}`,
  };
}

function isSamePeriod(
  key: StoredManagedInferenceKey,
  entitlement: ManagedEntitlementState,
): boolean {
  return (
    key.periodStart.getTime() === entitlement.periodStart.getTime() &&
    key.periodEnd.getTime() === entitlement.periodEnd.getTime()
  );
}

export function createManagedKeyLifecycle(
  dependencies: ManagedKeyLifecycleDependencies,
) {
  async function revokeKey(key: StoredManagedInferenceKey): Promise<void> {
    if (key.lifecycleState === "revoked") {
      return;
    }
    await dependencies.store.markRevoking(key.id);
    try {
      if (key.providerKeyId) {
        await dependencies.managementClient.disableKey(key.providerKeyId);
      }
      await dependencies.store.markRevoked(key.id);
    } catch {
      await dependencies.store.markFailed(key.id, "management_unavailable");
      throw new ManagedKeyLifecycleError("managed_key_revocation_failed");
    }
  }

  async function revokeStaleKeys(
    keys: StoredManagedInferenceKey[],
    currentId: string | null,
  ): Promise<void> {
    for (const key of keys) {
      if (key.id !== currentId && key.lifecycleState !== "revoked") {
        await revokeKey(key);
      }
    }
  }

  return {
    async sync(entitlement: ManagedEntitlementState): Promise<void> {
      const keys = await dependencies.store.listForUser(entitlement.userId);
      if (entitlement.state === "inactive") {
        await revokeStaleKeys(keys, null);
        return;
      }

      const current = keys.find(
        (key) =>
          key.lifecycleState === "active" && isSamePeriod(key, entitlement),
      );
      if (current?.envelope && current.providerKeyId) {
        await revokeStaleKeys(keys, current.id);
        return;
      }

      const identity = getManagedKeyIdentity(entitlement);
      const provisioning = await dependencies.store.beginProvisioning({
        id: identity.id,
        userId: entitlement.userId,
        entitlementId: entitlement.id,
        label: identity.label,
        periodStart: entitlement.periodStart,
        periodEnd: entitlement.periodEnd,
      });
      if (!provisioning.claimed) {
        throw new ManagedKeyLifecycleError(
          "managed_key_provisioning_in_progress",
        );
      }
      const provisioningRecord = provisioning.record;

      try {
        const orphanedProviderKeyIds =
          await dependencies.managementClient.findKeyIdsByName(identity.label);
        for (const providerKeyId of orphanedProviderKeyIds) {
          await dependencies.managementClient.disableKey(providerKeyId);
        }
        const created = await dependencies.managementClient.createKey({
          name: identity.label,
          expiresAt: entitlement.periodEnd,
        });
        const envelope = dependencies.encrypt(created.plaintext, {
          userId: entitlement.userId,
          source: "managed",
        });
        await dependencies.store.activate({
          id: provisioningRecord.id,
          providerKeyId: created.providerKeyId,
          keyHash: stableHash(created.plaintext),
          envelope,
        });
      } catch {
        await dependencies.store.markFailed(
          provisioningRecord.id,
          "management_unavailable",
        );
        throw new ManagedKeyLifecycleError("managed_key_provisioning_failed");
      }

      await revokeStaleKeys(keys, provisioningRecord.id);
    },
  };
}
