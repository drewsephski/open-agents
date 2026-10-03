import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerCredentials } from "@/lib/db/schema";
import { codexCredentialStore } from "@/lib/credentials/provider-credential-store";
import {
  decryptCredential,
  encryptCredential,
  loadCredentialKeyring,
} from "@/lib/credentials/envelope-encryption";
import { parseCodexAuthFile } from "./auth-file";

export async function getCodexConnection(userId: string) {
  const credential = await codexCredentialStore.getForUser(userId);
  return { connected: credential?.validationState === "valid" };
}

export async function saveCodexConnection(userId: string, authFile: string) {
  const normalized = parseCodexAuthFile(authFile);
  await codexCredentialStore.upsertForUser({
    userId,
    ...encryptCredential(normalized, {
      userId,
      provider: "codex",
      keyring: loadCredentialKeyring(),
    }),
    label: "Codex subscription",
    lastFour: "",
    validatedAt: new Date(),
  });
  return { connected: true };
}

export async function loadCodexAuth(userId: string) {
  const credential = await codexCredentialStore.getForUser(userId);
  if (credential?.validationState !== "valid")
    throw new Error(
      "Connect your Codex subscription in Connections, then retry.",
    );
  const plaintext = decryptCredential(credential, {
    userId,
    provider: "codex",
    keyring: loadCredentialKeyring(),
  });
  return {
    authFile: parseCodexAuthFile(plaintext),
    ciphertext: credential.ciphertext,
  };
}

// Refresh must not resurrect a disconnected credential or overwrite a newer login.
export async function persistRefreshedCodexAuth(
  userId: string,
  previousCiphertext: string,
  authFile: string,
) {
  const normalized = parseCodexAuthFile(authFile);
  const envelope = encryptCredential(normalized, {
    userId,
    provider: "codex",
    keyring: loadCredentialKeyring(),
  });
  await db
    .update(providerCredentials)
    .set({ ...envelope, updatedAt: new Date() })
    .where(
      and(
        eq(providerCredentials.userId, userId),
        eq(providerCredentials.provider, "codex"),
        eq(providerCredentials.ciphertext, previousCiphertext),
        eq(providerCredentials.validationState, "valid"),
      ),
    );
}

export async function deleteCodexConnection(userId: string) {
  await codexCredentialStore.deleteForUser(userId);
  return { connected: false };
}
