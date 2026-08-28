import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const NONCE_LENGTH_BYTES = 12;

export interface CredentialEnvelope {
  ciphertext: string;
  nonce: string;
  authenticationTag: string;
  encryptionKeyVersion: number;
}

interface CreateCredentialKeyringInput {
  activeVersion: number;
  keys: Readonly<Record<number, Uint8Array>>;
}

export interface CredentialKeyring {
  activeVersion: number;
  getKey(version: number): Uint8Array | undefined;
}

type CredentialEncryptionEnvironment = Readonly<
  Record<string, string | undefined>
>;

interface CredentialCryptographyContext {
  keyring: CredentialKeyring;
  userId: string;
  provider: "openrouter";
}

export function createCredentialKeyring(
  input: CreateCredentialKeyringInput,
): CredentialKeyring {
  if (!Number.isSafeInteger(input.activeVersion) || input.activeVersion < 1) {
    throw new Error("Credential encryption key version must be positive");
  }

  const keys = new Map<number, Uint8Array>();
  for (const [rawVersion, rawKey] of Object.entries(input.keys)) {
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("Credential encryption key version must be positive");
    }
    if (rawKey.byteLength !== KEY_LENGTH_BYTES) {
      throw new Error("Credential encryption keys must be 256 bits");
    }
    keys.set(version, Uint8Array.from(rawKey));
  }

  if (!keys.has(input.activeVersion)) {
    throw new Error("Active credential encryption key is missing");
  }

  return {
    activeVersion: input.activeVersion,
    getKey: (version) => keys.get(version),
  };
}

function decodeEncryptionKey(encodedKey: string): Uint8Array {
  const normalized = encodedKey.trim();
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(normalized)) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 256-bit key");
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.byteLength !== KEY_LENGTH_BYTES) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 256-bit key");
  }
  return decoded;
}

export function loadCredentialKeyring(
  environment: CredentialEncryptionEnvironment = process.env,
): CredentialKeyring {
  const encodedActiveKey = environment.ENCRYPTION_KEY;
  if (!encodedActiveKey) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const rawVersion = environment.ENCRYPTION_KEY_VERSION?.trim() ?? "1";
  const activeVersion = Number(rawVersion);
  if (!Number.isSafeInteger(activeVersion) || activeVersion < 1) {
    throw new Error("ENCRYPTION_KEY_VERSION must be a positive integer");
  }

  const keys: Record<number, Uint8Array> = {
    [activeVersion]: decodeEncryptionKey(encodedActiveKey),
  };
  for (const [name, value] of Object.entries(environment)) {
    const match = /^ENCRYPTION_KEY_V([1-9]\d*)$/.exec(name);
    if (!(match?.[1] && value)) {
      continue;
    }
    const version = Number(match[1]);
    if (version !== activeVersion) {
      keys[version] = decodeEncryptionKey(value);
    }
  }

  return createCredentialKeyring({ activeVersion, keys });
}

function getAdditionalAuthenticatedData(
  context: Omit<CredentialCryptographyContext, "keyring">,
  keyVersion: number,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      purpose: "provider-credential",
      userId: context.userId,
      provider: context.provider,
      keyVersion,
    }),
    "utf8",
  );
}

export function encryptCredential(
  plaintext: string,
  context: CredentialCryptographyContext,
): CredentialEnvelope {
  const encryptionKeyVersion = context.keyring.activeVersion;
  const key = context.keyring.getKey(encryptionKeyVersion);
  if (!key) {
    throw new Error("Active credential encryption key is missing");
  }

  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(getAdditionalAuthenticatedData(context, encryptionKeyVersion));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    nonce: nonce.toString("base64url"),
    authenticationTag: cipher.getAuthTag().toString("base64url"),
    encryptionKeyVersion,
  };
}

export function decryptCredential(
  envelope: CredentialEnvelope,
  context: CredentialCryptographyContext,
): string {
  const key = context.keyring.getKey(envelope.encryptionKeyVersion);
  if (!key) {
    throw new Error("Credential could not be decrypted");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(envelope.nonce, "base64url"),
    );
    decipher.setAAD(
      getAdditionalAuthenticatedData(context, envelope.encryptionKeyVersion),
    );
    decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Credential could not be decrypted");
  }
}
