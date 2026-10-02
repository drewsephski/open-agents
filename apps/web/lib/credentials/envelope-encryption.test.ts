import { describe, expect, mock, test } from "bun:test";
import { createCipheriv } from "node:crypto";

mock.module("server-only", () => ({}));

const encryptionModulePromise = import("./envelope-encryption");

const KEY_V1 = Buffer.alloc(32, 1);

function createNonstandardEnvelope(options: {
  nonceLength: number;
  authenticationTagLength: number;
}) {
  const nonce = Buffer.alloc(options.nonceLength, 3);
  const cipher = createCipheriv("aes-256-gcm", KEY_V1, nonce, {
    authTagLength: options.authenticationTagLength,
  });
  cipher.setAAD(
    Buffer.from(
      JSON.stringify({
        purpose: "provider-credential",
        userId: "user-1",
        provider: "openrouter",
        keyVersion: 1,
      }),
      "utf8",
    ),
  );
  const ciphertext = Buffer.concat([
    cipher.update("sk-or-v1-sensitive", "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authenticationTag: cipher.getAuthTag().toString("base64url"),
    encryptionKeyVersion: 1,
  };
}

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

  test("rejects junk suffixes and invalid base64url characters in every envelope field", async () => {
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

    for (const invalidCharacter of ["!", "+", "/"]) {
      for (const field of [
        "ciphertext",
        "nonce",
        "authenticationTag",
      ] as const) {
        expect(() =>
          decryptCredential(
            {
              ...envelope,
              [field]: `${envelope[field]}${invalidCharacter}`,
            },
            { keyring, userId: "user-1", provider: "openrouter" },
          ),
        ).toThrow("Credential could not be decrypted");
      }
    }
  });

  test("rejects padded and noncanonical base64url envelope fields", async () => {
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
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const tagLastCharacter = envelope.authenticationTag.at(-1);
    const tagLastIndex = tagLastCharacter
      ? alphabet.indexOf(tagLastCharacter)
      : -1;
    expect(tagLastIndex).toBeGreaterThanOrEqual(0);
    const noncanonicalTag = `${envelope.authenticationTag.slice(0, -1)}${alphabet.charAt(tagLastIndex + 1)}`;
    expect(Buffer.from(noncanonicalTag, "base64url")).toEqual(
      Buffer.from(envelope.authenticationTag, "base64url"),
    );

    for (const field of ["ciphertext", "nonce", "authenticationTag"] as const) {
      expect(() =>
        decryptCredential(
          { ...envelope, [field]: `${envelope[field]}=` },
          { keyring, userId: "user-1", provider: "openrouter" },
        ),
      ).toThrow("Credential could not be decrypted");
    }
    expect(() =>
      decryptCredential(
        { ...envelope, authenticationTag: noncanonicalTag },
        { keyring, userId: "user-1", provider: "openrouter" },
      ),
    ).toThrow("Credential could not be decrypted");
  });

  test("rejects non-12-byte nonces and non-16-byte authentication tags", async () => {
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

    for (const nonceLength of [11, 13]) {
      const nonstandardEnvelope = createNonstandardEnvelope({
        nonceLength,
        authenticationTagLength: 16,
      });
      expect(() =>
        decryptCredential(nonstandardEnvelope, {
          keyring,
          userId: "user-1",
          provider: "openrouter",
        }),
      ).toThrow("Credential could not be decrypted");
    }
    const shortTagEnvelope = createNonstandardEnvelope({
      nonceLength: 12,
      authenticationTagLength: 15,
    });
    expect(() =>
      decryptCredential(shortTagEnvelope, {
        keyring,
        userId: "user-1",
        provider: "openrouter",
      }),
    ).toThrow("Credential could not be decrypted");
    expect(() =>
      decryptCredential(
        {
          ...envelope,
          authenticationTag: Buffer.alloc(17).toString("base64url"),
        },
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
