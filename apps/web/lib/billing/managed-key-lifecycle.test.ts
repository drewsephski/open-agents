import { describe, expect, mock, test } from "bun:test";
import type { CredentialEnvelope } from "@/lib/credentials/envelope-encryption";
import type { ManagedEntitlementState } from "./managed-key-lifecycle";

mock.module("server-only", () => ({}));

const { createManagedKeyLifecycle } = await import("./managed-key-lifecycle");

interface TestKey {
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

const entitlement: ManagedEntitlementState = {
  id: "entitlement-1",
  userId: "user-1",
  state: "active",
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-01T00:00:00.000Z"),
};

function createHarness() {
  const keys: TestKey[] = [];
  const createCalls: Array<{ name: string; expiresAt: Date }> = [];
  const disableCalls: string[] = [];
  const activeRemoteKeyIds = new Set<string>();
  let createError: Error | null = null;
  let disableError: Error | null = null;
  let provisioningClaimed = true;
  let claimGeneration = 0;
  let authoritativeEntitlement = entitlement;
  let creationGate: Promise<void> | null = null;
  let releaseCreation: (() => void) | null = null;
  const claims = new Map<string, { token: string; generation: number }>();
  const cleanupJobs = new Map<
    string,
    {
      providerKeyId: string;
      userId: string;
      managedKeyId: string | null;
      label: string;
      state: "pending" | "processing" | "attached" | "done";
      claim: { token: string; generation: number } | null;
      generation: number;
    }
  >();

  const lifecycle = createManagedKeyLifecycle({
    store: {
      listForUser: async (userId) =>
        keys.filter((key) => key.userId === userId),
      listCleanupForUser: async (userId) =>
        [...cleanupJobs.values()].filter(
          (job) =>
            job.userId === userId &&
            (job.state === "pending" || job.state === "processing"),
        ),
      trackRemoteKey: async (input) => {
        if (!cleanupJobs.has(input.providerKeyId)) {
          cleanupJobs.set(input.providerKeyId, {
            ...input,
            state: "pending",
            claim: null,
            generation: 0,
          });
        }
      },
      requireCleanup: async (providerKeyId) =>
        cleanupJobs.get(providerKeyId)?.state === "pending",
      claimCleanup: async (providerKeyId) => {
        const job = cleanupJobs.get(providerKeyId);
        if (!job) {
          return { state: "busy" as const };
        }
        if (job.state === "attached" || job.state === "done") {
          return { state: job.state };
        }
        job.generation += 1;
        job.claim = {
          token: `cleanup-${providerKeyId}-${job.generation}`,
          generation: job.generation,
        };
        job.state = "processing";
        return { state: "claimed" as const, claim: job.claim };
      },
      finishCleanup: async (input) => {
        const job = cleanupJobs.get(input.providerKeyId);
        if (job?.claim?.token !== input.claim.token) {
          return false;
        }
        job.state = "done";
        job.claim = null;
        return true;
      },
      failCleanup: async (input) => {
        const job = cleanupJobs.get(input.providerKeyId);
        if (job?.claim?.token !== input.claim.token) {
          return false;
        }
        job.state = "pending";
        job.claim = null;
        return true;
      },
      beginProvisioning: async (input) => {
        if (!provisioningClaimed) {
          return { state: "busy" as const };
        }
        const existing = keys.find((key) => key.id === input.id);
        claimGeneration += 1;
        const claim = {
          token: `claim-${claimGeneration}`,
          generation: claimGeneration,
        };
        claims.set(input.id, claim);
        if (existing) {
          existing.lifecycleState = "provisioning";
          existing.provisioningErrorCode = null;
          return { state: "claimed" as const, record: existing, claim };
        }
        const key: TestKey = {
          ...input,
          providerKeyId: null,
          lifecycleState: "provisioning",
          envelope: null,
          provisioningErrorCode: null,
        };
        keys.push(key);
        return { state: "claimed" as const, record: key, claim };
      },
      shouldKeyRemainActive: async (key) =>
        authoritativeEntitlement.state === "active" &&
        key.entitlementId === authoritativeEntitlement.id &&
        key.periodStart.getTime() ===
          authoritativeEntitlement.periodStart.getTime() &&
        key.periodEnd.getTime() ===
          authoritativeEntitlement.periodEnd.getTime(),
      activate: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        const claim = claims.get(input.id);
        if (
          !key ||
          !claim ||
          claim.token !== input.claim.token ||
          claim.generation !== input.claim.generation
        ) {
          return false;
        }
        const cleanup = cleanupJobs.get(input.providerKeyId);
        if (!cleanup || cleanup.state !== "pending") {
          return false;
        }
        Object.assign(key, input, {
          lifecycleState: "active",
          provisioningErrorCode: null,
        });
        cleanup.state = "attached";
        claims.delete(input.id);
        return true;
      },
      discardProvisioning: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        const claim = claims.get(input.id);
        if (key && claim?.token === input.claim.token) {
          key.lifecycleState = "revoked";
          claims.delete(input.id);
          return true;
        }
        return false;
      },
      markFailed: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        const claim = claims.get(input.id);
        if (
          key &&
          claim?.token === input.claim.token &&
          claim.generation === input.claim.generation
        ) {
          key.lifecycleState = "failed";
          key.provisioningErrorCode = input.errorCode;
          claims.delete(input.id);
          return true;
        }
        return false;
      },
      claimRevocation: async (key) => {
        if (key.lifecycleState === "revoked") {
          return { state: "revoked" as const };
        }
        claimGeneration += 1;
        const claim = {
          token: `claim-${claimGeneration}`,
          generation: claimGeneration,
        };
        claims.set(key.id, claim);
        key.lifecycleState = "revoking";
        return { state: "claimed" as const, claim };
      },
      finishRevocation: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        const claim = claims.get(input.id);
        if (key && claim?.token === input.claim.token) {
          key.lifecycleState = "revoked";
          key.envelope = null;
          claims.delete(input.id);
          return true;
        }
        return false;
      },
      releaseRevocation: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        const claim = claims.get(input.id);
        if (key && claim?.token === input.claim.token) {
          key.lifecycleState = "active";
          claims.delete(input.id);
          return true;
        }
        return false;
      },
    },
    managementClient: {
      createKey: async (input) => {
        createCalls.push(input);
        if (createError) {
          throw createError;
        }
        if (creationGate) {
          await creationGate;
          creationGate = null;
          releaseCreation = null;
        }
        const suffix = String(createCalls.length);
        activeRemoteKeyIds.add(`provider-hash-${suffix}`);
        return {
          providerKeyId: `provider-hash-${suffix}`,
          plaintext: `sk-or-v1-managed-${suffix}`,
          label: input.name,
        };
      },
      disableKey: async (providerKeyId) => {
        disableCalls.push(providerKeyId);
        if (disableError) {
          throw disableError;
        }
        activeRemoteKeyIds.delete(providerKeyId);
      },
      findKeyIdsByName: async () => [],
    },
    encrypt: (plaintext, context) => ({
      ciphertext: `encrypted:${plaintext}`,
      nonce: `nonce:${context.userId}`,
      authenticationTag: "tag",
      encryptionKeyVersion: 1,
    }),
  });

  return {
    keys,
    activeRemoteKeyIds,
    createCalls,
    disableCalls,
    lifecycle,
    failCreation(error: Error) {
      createError = error;
    },
    failDisable(error: Error | null) {
      disableError = error;
    },
    setProvisioningClaimed(claimed: boolean) {
      provisioningClaimed = claimed;
    },
    setAuthoritativeEntitlement(value: ManagedEntitlementState) {
      authoritativeEntitlement = value;
    },
    blockCreation() {
      creationGate = new Promise<void>((resolve) => {
        releaseCreation = resolve;
      });
      return () => releaseCreation?.();
    },
  };
}

describe("managed OpenRouter key lifecycle", () => {
  test("provisions and encrypts one period-bound key for an entitled user", async () => {
    const harness = createHarness();

    await harness.lifecycle.sync(entitlement);
    await harness.lifecycle.sync(entitlement);

    expect(harness.createCalls).toHaveLength(1);
    expect(harness.createCalls[0]).toEqual({
      name: "Launchstack managed c6c289e49e9c 2026-08-01",
      expiresAt: entitlement.periodEnd,
    });
    expect(harness.keys).toHaveLength(1);
    expect(harness.keys[0]).toMatchObject({
      entitlementId: "entitlement-1",
      providerKeyId: "provider-hash-1",
      lifecycleState: "active",
      periodStart: entitlement.periodStart,
      periodEnd: entitlement.periodEnd,
      envelope: {
        ciphertext: "encrypted:sk-or-v1-managed-1",
        nonce: "nonce:user-1",
        authenticationTag: "tag",
        encryptionKeyVersion: 1,
      },
      provisioningErrorCode: null,
    });
    expect(harness.keys[0]).not.toHaveProperty("plaintext");
  });

  test("rotates at a verified billing-period transition and revokes the prior key", async () => {
    const harness = createHarness();
    await harness.lifecycle.sync(entitlement);

    const renewedEntitlement = {
      ...entitlement,
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    };
    harness.setAuthoritativeEntitlement(renewedEntitlement);
    await harness.lifecycle.sync(renewedEntitlement);

    expect(harness.createCalls).toHaveLength(2);
    expect(harness.disableCalls).toEqual(["provider-hash-1"]);
    expect(harness.keys.map((key) => key.lifecycleState).sort()).toEqual([
      "active",
      "revoked",
    ]);
  });

  test("disables the managed credential when entitlement ends", async () => {
    const harness = createHarness();
    await harness.lifecycle.sync(entitlement);

    const inactiveEntitlement = { ...entitlement, state: "inactive" as const };
    harness.setAuthoritativeEntitlement(inactiveEntitlement);
    await harness.lifecycle.sync(inactiveEntitlement);

    expect(harness.disableCalls).toEqual(["provider-hash-1"]);
    expect(harness.keys[0]?.lifecycleState).toBe("revoked");
  });

  test("records a retryable provisioning failure without exposing the provider error", async () => {
    const harness = createHarness();
    harness.failCreation(new Error("provider echoed management-secret"));

    await expect(harness.lifecycle.sync(entitlement)).rejects.toThrow(
      "managed_key_provisioning_failed",
    );
    expect(harness.keys[0]).toMatchObject({
      lifecycleState: "failed",
      provisioningErrorCode: "management_unavailable",
    });
    expect(JSON.stringify(harness.keys)).not.toContain("management-secret");
  });

  test("does not create a second provider key while another provisioner owns the lease", async () => {
    const harness = createHarness();
    harness.setProvisioningClaimed(false);

    await expect(harness.lifecycle.sync(entitlement)).rejects.toThrow(
      "managed_key_provisioning_in_progress",
    );
    expect(harness.createCalls).toHaveLength(0);
  });

  test("revokes a remotely created key when entitlement is lost mid-provision", async () => {
    const harness = createHarness();
    const releaseCreation = harness.blockCreation();

    const provisioning = harness.lifecycle.sync(entitlement);
    while (harness.createCalls.length === 0) {
      await Promise.resolve();
    }
    harness.setAuthoritativeEntitlement({ ...entitlement, state: "inactive" });
    releaseCreation();
    await provisioning;

    expect(harness.disableCalls).toEqual(["provider-hash-1"]);
    expect(harness.keys[0]?.lifecycleState).toBe("revoked");
    expect(harness.keys[0]?.providerKeyId).toBeNull();
  });

  test("durably retries cleanup when entitlement is lost and remote disable fails", async () => {
    const harness = createHarness();
    const releaseCreation = harness.blockCreation();
    harness.failDisable(new Error("management timeout"));

    const provisioning = harness.lifecycle.sync(entitlement);
    while (harness.createCalls.length === 0) {
      await Promise.resolve();
    }
    const inactiveEntitlement = { ...entitlement, state: "inactive" as const };
    harness.setAuthoritativeEntitlement(inactiveEntitlement);
    releaseCreation();
    await expect(provisioning).rejects.toThrow(
      "managed_key_provisioning_failed",
    );
    expect(harness.activeRemoteKeyIds.has("provider-hash-1")).toBe(true);

    harness.failDisable(null);
    await harness.lifecycle.sync(inactiveEntitlement);

    expect(harness.activeRemoteKeyIds.has("provider-hash-1")).toBe(false);
    expect(harness.disableCalls).toContain("provider-hash-1");
  });

  test("fences a stale provisioner after its lease is reclaimed", async () => {
    let generation = 0;
    let activeClaim: { token: string; generation: number } | null = null;
    const key: TestKey & {
      claimToken: string | null;
      claimGeneration: number;
    } = {
      id: "managed-overlap",
      userId: entitlement.userId,
      entitlementId: entitlement.id,
      providerKeyId: null,
      lifecycleState: "provisioning",
      label: "overlap",
      periodStart: entitlement.periodStart,
      periodEnd: entitlement.periodEnd,
      envelope: null,
      provisioningErrorCode: null,
      claimToken: null,
      claimGeneration: 0,
    };
    let createCount = 0;
    let releaseFirstCreate: (() => void) | undefined;
    const firstCreateBlocked = new Promise<void>((resolve) => {
      releaseFirstCreate = resolve;
    });
    const disabled: string[] = [];
    const cleanupStates = new Map<
      string,
      "pending" | "processing" | "attached" | "done"
    >();
    const store = {
      listForUser: async () => [key],
      listCleanupForUser: async () => [],
      trackRemoteKey: async (input: { providerKeyId: string }) => {
        cleanupStates.set(input.providerKeyId, "pending");
      },
      requireCleanup: async () => true,
      claimCleanup: async (providerKeyId: string) => {
        const state = cleanupStates.get(providerKeyId);
        if (state === "attached" || state === "done") {
          return { state };
        }
        cleanupStates.set(providerKeyId, "processing");
        return {
          state: "claimed" as const,
          claim: { token: `cleanup-${providerKeyId}`, generation: 1 },
        };
      },
      finishCleanup: async (input: { providerKeyId: string }) => {
        cleanupStates.set(input.providerKeyId, "done");
        return true;
      },
      failCleanup: async () => true,
      beginProvisioning: async () => {
        generation += 1;
        activeClaim = { token: `claim-${generation}`, generation };
        key.claimToken = activeClaim.token;
        key.claimGeneration = activeClaim.generation;
        key.lifecycleState = "provisioning";
        return { state: "claimed" as const, record: key, claim: activeClaim };
      },
      shouldKeyRemainActive: async () => true,
      activate: async (input: {
        claim?: { token: string; generation: number };
        providerKeyId: string;
      }) => {
        if (
          !input.claim ||
          input.claim.token !== activeClaim?.token ||
          input.claim.generation !== activeClaim.generation
        ) {
          return false;
        }
        key.providerKeyId = input.providerKeyId;
        key.lifecycleState = "active";
        cleanupStates.set(input.providerKeyId, "attached");
        return true;
      },
      discardProvisioning: async () => false,
      markFailed: async () => false,
      claimRevocation: async () => ({ state: "busy" as const }),
      finishRevocation: async () => true,
      releaseRevocation: async () => true,
    };
    const lifecycle = createManagedKeyLifecycle({
      store: store as never,
      managementClient: {
        createKey: async (input) => {
          createCount += 1;
          const suffix = String(createCount);
          if (createCount === 1) {
            await firstCreateBlocked;
          }
          return {
            providerKeyId: `provider-${suffix}`,
            plaintext: `secret-${suffix}`,
            label: input.name,
          };
        },
        disableKey: async (providerKeyId) => {
          disabled.push(providerKeyId);
        },
        findKeyIdsByName: async () => [],
      },
      encrypt: () => ({
        ciphertext: "ciphertext",
        nonce: "nonce",
        authenticationTag: "tag",
        encryptionKeyVersion: 1,
      }),
    });

    const first = lifecycle.sync(entitlement);
    while (createCount === 0) {
      await Promise.resolve();
    }
    await lifecycle.sync(entitlement);
    releaseFirstCreate?.();
    await first;

    expect(key.providerKeyId).toBe("provider-2");
    expect(disabled).toEqual(["provider-1"]);
  });
});
