import { describe, expect, mock, test } from "bun:test";
import type { CredentialEnvelope } from "@/lib/credentials/envelope-encryption";

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

function createHarness() {
  const keys: TestKey[] = [];
  const createCalls: Array<{ name: string; expiresAt: Date }> = [];
  const disableCalls: string[] = [];
  let createError: Error | null = null;
  let provisioningClaimed = true;

  const lifecycle = createManagedKeyLifecycle({
    store: {
      listForUser: async (userId) =>
        keys.filter((key) => key.userId === userId),
      beginProvisioning: async (input) => {
        const existing = keys.find((key) => key.id === input.id);
        if (existing) {
          existing.lifecycleState = "provisioning";
          existing.provisioningErrorCode = null;
          return { record: existing, claimed: provisioningClaimed };
        }
        const key: TestKey = {
          ...input,
          providerKeyId: null,
          lifecycleState: "provisioning",
          envelope: null,
          provisioningErrorCode: null,
        };
        keys.push(key);
        return { record: key, claimed: provisioningClaimed };
      },
      activate: async (input) => {
        const key = keys.find((candidate) => candidate.id === input.id);
        if (!key) {
          throw new Error("missing test key");
        }
        Object.assign(key, input, {
          lifecycleState: "active",
          provisioningErrorCode: null,
        });
      },
      markFailed: async (id, errorCode) => {
        const key = keys.find((candidate) => candidate.id === id);
        if (key) {
          key.lifecycleState = "failed";
          key.provisioningErrorCode = errorCode;
        }
      },
      markRevoking: async (id) => {
        const key = keys.find((candidate) => candidate.id === id);
        if (key) {
          key.lifecycleState = "revoking";
        }
      },
      markRevoked: async (id) => {
        const key = keys.find((candidate) => candidate.id === id);
        if (key) {
          key.lifecycleState = "revoked";
        }
      },
    },
    managementClient: {
      createKey: async (input) => {
        createCalls.push(input);
        if (createError) {
          throw createError;
        }
        const suffix = String(createCalls.length);
        return {
          providerKeyId: `provider-hash-${suffix}`,
          plaintext: `sk-or-v1-managed-${suffix}`,
          label: input.name,
        };
      },
      disableKey: async (providerKeyId) => {
        disableCalls.push(providerKeyId);
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
    createCalls,
    disableCalls,
    lifecycle,
    failCreation(error: Error) {
      createError = error;
    },
    setProvisioningClaimed(claimed: boolean) {
      provisioningClaimed = claimed;
    },
  };
}

const entitlement = {
  id: "entitlement-1",
  userId: "user-1",
  state: "active" as const,
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-01T00:00:00.000Z"),
};

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

    await harness.lifecycle.sync({
      ...entitlement,
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    });

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

    await harness.lifecycle.sync({ ...entitlement, state: "inactive" });

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
});
