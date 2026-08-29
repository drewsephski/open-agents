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
  }): Promise<
    | { state: "busy" }
    | {
        state: "claimed";
        record: StoredManagedInferenceKey;
        claim: { token: string; generation: number };
      }
  >;
  shouldKeyRemainActive(key: StoredManagedInferenceKey): Promise<boolean>;
  activate(input: {
    id: string;
    claim: { token: string; generation: number };
    providerKeyId: string;
    keyHash: string;
    envelope: CredentialEnvelope;
  }): Promise<boolean>;
  discardProvisioning(input: {
    id: string;
    claim: { token: string; generation: number };
  }): Promise<boolean>;
  claimRevocation(key: StoredManagedInferenceKey): Promise<
    | { state: "revoked" }
    | { state: "busy" }
    | {
        state: "claimed";
        claim: { token: string; generation: number };
      }
  >;
  finishRevocation(input: {
    id: string;
    claim: { token: string; generation: number };
  }): Promise<boolean>;
  releaseRevocation(input: {
    id: string;
    claim: { token: string; generation: number };
  }): Promise<boolean>;
  markFailed(input: {
    id: string;
    claim: { token: string; generation: number };
    errorCode: string;
  }): Promise<boolean>;
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
    const revocation = await dependencies.store.claimRevocation(key);
    if (revocation.state === "revoked") {
      return;
    }
    if (revocation.state === "busy") {
      throw new ManagedKeyLifecycleError("managed_key_revocation_failed");
    }
    if (await dependencies.store.shouldKeyRemainActive(key)) {
      await dependencies.store.releaseRevocation({
        id: key.id,
        claim: revocation.claim,
      });
      return;
    }
    try {
      if (key.providerKeyId) {
        await dependencies.managementClient.disableKey(key.providerKeyId);
      }
      const finished = await dependencies.store.finishRevocation({
        id: key.id,
        claim: revocation.claim,
      });
      if (!finished) {
        throw new ManagedKeyLifecycleError("managed_key_revocation_failed");
      }
    } catch {
      await dependencies.store.markFailed({
        id: key.id,
        claim: revocation.claim,
        errorCode: "management_unavailable",
      });
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
      if (provisioning.state === "busy") {
        throw new ManagedKeyLifecycleError(
          "managed_key_provisioning_in_progress",
        );
      }
      const provisioningRecord = provisioning.record;
      let createdProviderKeyId: string | null = null;
      let remoteKeyDisabled = false;

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
        createdProviderKeyId = created.providerKeyId;
        if (
          !(await dependencies.store.shouldKeyRemainActive(provisioningRecord))
        ) {
          await dependencies.managementClient.disableKey(created.providerKeyId);
          remoteKeyDisabled = true;
          await dependencies.store.discardProvisioning({
            id: provisioningRecord.id,
            claim: provisioning.claim,
          });
          return;
        }
        const envelope = dependencies.encrypt(created.plaintext, {
          userId: entitlement.userId,
          source: "managed",
        });
        const activated = await dependencies.store.activate({
          id: provisioningRecord.id,
          claim: provisioning.claim,
          providerKeyId: created.providerKeyId,
          keyHash: stableHash(created.plaintext),
          envelope,
        });
        if (!activated) {
          await dependencies.managementClient.disableKey(created.providerKeyId);
          remoteKeyDisabled = true;
          throw new ManagedKeyLifecycleError(
            "managed_key_provisioning_in_progress",
          );
        }
      } catch (error) {
        if (createdProviderKeyId && !remoteKeyDisabled) {
          try {
            await dependencies.managementClient.disableKey(
              createdProviderKeyId,
            );
          } catch {
            // The deterministic name is reconciled before the next create.
          }
        }
        await dependencies.store.markFailed({
          id: provisioningRecord.id,
          claim: provisioning.claim,
          errorCode: "management_unavailable",
        });
        if (
          error instanceof ManagedKeyLifecycleError &&
          error.message === "managed_key_provisioning_in_progress"
        ) {
          return;
        }
        throw new ManagedKeyLifecycleError("managed_key_provisioning_failed");
      }

      await revokeStaleKeys(keys, provisioningRecord.id);
    },
  };
}
