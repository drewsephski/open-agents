import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  ProviderCredentialStore,
  StoredProviderCredential,
  UpsertProviderCredentialInput,
} from "./provider-credential-store";

mock.module("server-only", () => ({}));

const serviceModulePromise = import("./provider-credentials");
const encryptionModulePromise = import("./envelope-encryption");

describe("provider credential lifecycle", () => {
  const records = new Map<string, StoredProviderCredential>();
  const upsertCalls: UpsertProviderCredentialInput[] = [];
  const deleteCalls: string[] = [];

  const store: ProviderCredentialStore = {
    getForUser: async (userId) => records.get(userId) ?? null,
    upsertForUser: async (input) => {
      upsertCalls.push(input);
      const stored: StoredProviderCredential = {
        ...input,
        validationState: "valid",
        revokedAt: null,
      };
      records.set(input.userId, stored);
      return stored;
    },
    deleteForUser: async (userId) => {
      deleteCalls.push(userId);
      return records.delete(userId);
    },
  };

  beforeEach(() => {
    records.clear();
    upsertCalls.length = 0;
    deleteCalls.length = 0;
  });

  test("stores a validated credential as ciphertext and returns only safe metadata", async () => {
    const { createProviderCredentialService } = await serviceModulePromise;
    const { createCredentialKeyring } = await encryptionModulePromise;
    const now = new Date("2026-08-28T12:00:00.000Z");
    const service = createProviderCredentialService({
      keyring: createCredentialKeyring({
        activeVersion: 1,
        keys: { 1: Buffer.alloc(32, 7) },
      }),
      now: () => now,
      store,
      validate: async () => ({ state: "valid", label: "Production key" }),
    });

    const result = await service.replaceOpenRouterCredential(
      "user-1",
      "sk-or-v1-very-sensitive-1234",
    );

    expect(result).toEqual({
      state: "valid",
      label: "Production key",
      lastFour: "1234",
      validatedAt: "2026-08-28T12:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("very-sensitive");
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]?.ciphertext).not.toContain("very-sensitive");
    expect(upsertCalls[0]).not.toHaveProperty("apiKey");
  });

  test("keeps the existing credential when a replacement is rejected", async () => {
    const { createProviderCredentialService } = await serviceModulePromise;
    const { createCredentialKeyring } = await encryptionModulePromise;
    const existingValidatedAt = new Date("2026-08-27T12:00:00.000Z");
    records.set("user-1", {
      ciphertext: "existing-ciphertext",
      nonce: "existing-nonce",
      authenticationTag: "existing-tag",
      encryptionKeyVersion: 1,
      label: "Existing key",
      lastFour: "9999",
      validationState: "valid",
      validatedAt: existingValidatedAt,
      revokedAt: null,
    });
    const service = createProviderCredentialService({
      keyring: createCredentialKeyring({
        activeVersion: 1,
        keys: { 1: Buffer.alloc(32, 7) },
      }),
      store,
      validate: async () => ({ state: "invalid" }),
    });

    const replacement = await service.replaceOpenRouterCredential(
      "user-1",
      "rejected-secret",
    );
    const status = await service.getOpenRouterCredentialStatus("user-1");

    expect(replacement).toEqual({
      state: "invalid",
      label: null,
      lastFour: null,
      validatedAt: null,
    });
    expect(upsertCalls).toHaveLength(0);
    expect(status).toEqual({
      state: "valid",
      label: "Existing key",
      lastFour: "9999",
      validatedAt: "2026-08-27T12:00:00.000Z",
    });
  });

  test("reads and deletes credentials only through the supplied owner id", async () => {
    const { createProviderCredentialService } = await serviceModulePromise;
    const { createCredentialKeyring } = await encryptionModulePromise;
    records.set("user-2", {
      ciphertext: "ciphertext",
      nonce: "nonce",
      authenticationTag: "tag",
      encryptionKeyVersion: 1,
      label: "User two key",
      lastFour: "2222",
      validationState: "valid",
      validatedAt: new Date("2026-08-28T12:00:00.000Z"),
      revokedAt: null,
    });
    const service = createProviderCredentialService({
      keyring: createCredentialKeyring({
        activeVersion: 1,
        keys: { 1: Buffer.alloc(32, 7) },
      }),
      store,
      validate: async () => ({ state: "valid", label: "unused" }),
    });

    expect(await service.getOpenRouterCredentialStatus("user-1")).toEqual({
      state: "missing",
      label: null,
      lastFour: null,
      validatedAt: null,
    });
    expect(await service.deleteOpenRouterCredential("user-1")).toEqual({
      state: "missing",
      label: null,
      lastFour: null,
      validatedAt: null,
    });
    expect(deleteCalls).toEqual(["user-1"]);
    expect(records.has("user-2")).toBe(true);
  });

  test("status and deletion remain available without loading encryption material", async () => {
    const { createProviderCredentialService } = await serviceModulePromise;
    let keyringLoadCount = 0;
    const service = createProviderCredentialService({
      keyring: () => {
        keyringLoadCount += 1;
        throw new Error("encryption configuration unavailable");
      },
      store,
      validate: async () => ({ state: "valid", label: "unused" }),
    });

    await service.getOpenRouterCredentialStatus("user-1");
    await service.deleteOpenRouterCredential("user-1");

    expect(keyringLoadCount).toBe(0);
  });
});
