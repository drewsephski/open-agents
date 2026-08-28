import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const encryptionModulePromise = import("./envelope-encryption");

const KEY_V1 = Buffer.alloc(32, 1);

describe("provider credential envelope encryption", () => {
  test("round trips plaintext with AES-256-GCM and records the active key version", async () => {
    const { createCredentialKeyring, decryptCredential, encryptCredential } =
      await encryptionModulePromise;
    const keyring = createCredentialKeyring({
      activeVersion: 1,
      keys: { 1: KEY_V1 },
    });

    const envelope = encryptCredential("sk-or-v1-sensitive", {
      keyring,
      userId: "user-1",
      provider: "openrouter",
    });
    expect(envelope.encryptionKeyVersion).toBe(1);
    expect(envelope.ciphertext).not.toContain("sk-or-v1-sensitive");
    expect(
      decryptCredential(envelope, {
        keyring,
        userId: "user-1",
        provider: "openrouter",
      }),
    ).toBe("sk-or-v1-sensitive");
  });

  test("fails closed for an unknown key version", async () => {
    const { createCredentialKeyring, decryptCredential, encryptCredential } =
      await encryptionModulePromise;
    const keyring = createCredentialKeyring({
      activeVersion: 1,
      keys: { 1: KEY_V1 },
    });
    const envelope = encryptCredential("sk-or-v1-sensitive", {
      keyring,
      userId: "user-1",
      provider: "openrouter",
    });
    expect(() =>
      decryptCredential(
        { ...envelope, encryptionKeyVersion: 2 },
        { keyring, userId: "user-1", provider: "openrouter" },
      ),
    ).toThrow("Credential could not be decrypted");
  });

  test("fails closed for the wrong key and tampered ciphertext", async () => {
    const { createCredentialKeyring, decryptCredential, encryptCredential } =
      await encryptionModulePromise;
    const keyring = createCredentialKeyring({
      activeVersion: 1,
      keys: { 1: KEY_V1 },
    });
    const wrongKeyring = createCredentialKeyring({
      activeVersion: 1,
      keys: { 1: Buffer.alloc(32, 2) },
    });
    const envelope = encryptCredential("sk-or-v1-sensitive", {
      keyring,
      userId: "user-1",
      provider: "openrouter",
    });
    const tamperedCiphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;

    expect(() =>
      decryptCredential(envelope, {
        keyring: wrongKeyring,
        userId: "user-1",
        provider: "openrouter",
      }),
    ).toThrow("Credential could not be decrypted");
    expect(() =>
      decryptCredential(
        { ...envelope, ciphertext: tamperedCiphertext },
        { keyring, userId: "user-1", provider: "openrouter" },
      ),
    ).toThrow("Credential could not be decrypted");
  });

  test("binds encrypted credentials to their owner", async () => {
    const { createCredentialKeyring, decryptCredential, encryptCredential } =
      await encryptionModulePromise;
    const keyring = createCredentialKeyring({
      activeVersion: 1,
      keys: { 1: KEY_V1 },
    });
    const envelope = encryptCredential("sk-or-v1-sensitive", {
      keyring,
      userId: "user-1",
      provider: "openrouter",
    });

    expect(() =>
      decryptCredential(envelope, {
        keyring,
        userId: "user-2",
        provider: "openrouter",
      }),
    ).toThrow("Credential could not be decrypted");
  });

  test("loads the active version and retained prior key material from server configuration", async () => {
    const { decryptCredential, encryptCredential, loadCredentialKeyring } =
      await encryptionModulePromise;
    const versionOne = Buffer.alloc(32, 1).toString("base64");
    const versionTwo = Buffer.alloc(32, 2).toString("base64");
    const oldKeyring = loadCredentialKeyring({
      ENCRYPTION_KEY: versionOne,
      ENCRYPTION_KEY_VERSION: "1",
    });
    const oldEnvelope = encryptCredential("sk-or-v1-sensitive", {
      keyring: oldKeyring,
      userId: "user-1",
      provider: "openrouter",
    });
    const rotatedKeyring = loadCredentialKeyring({
      ENCRYPTION_KEY: versionTwo,
      ENCRYPTION_KEY_VERSION: "2",
      ENCRYPTION_KEY_V1: versionOne,
    });

    expect(rotatedKeyring.activeVersion).toBe(2);
    expect(
      decryptCredential(oldEnvelope, {
        keyring: rotatedKeyring,
        userId: "user-1",
        provider: "openrouter",
      }),
    ).toBe("sk-or-v1-sensitive");
  });
});
