import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { providerCredentials } from "@/lib/db/schema";
import type { CredentialEnvelope } from "./envelope-encryption";

type CredentialProvider = "openrouter" | "codex";

export interface StoredProviderCredential extends CredentialEnvelope {
  label: string;
  lastFour: string;
  validationState: "pending" | "valid" | "invalid" | "revoked";
  validatedAt: Date | null;
  revokedAt: Date | null;
}

export interface UpsertProviderCredentialInput extends CredentialEnvelope {
  userId: string;
  label: string;
  lastFour: string;
  validatedAt: Date;
}

export interface ProviderCredentialStore {
  getForUser(userId: string): Promise<StoredProviderCredential | null>;
  upsertForUser(
    input: UpsertProviderCredentialInput,
  ): Promise<StoredProviderCredential>;
  deleteForUser(userId: string): Promise<boolean>;
}

const credentialSelection = {
  ciphertext: providerCredentials.ciphertext,
  nonce: providerCredentials.nonce,
  authenticationTag: providerCredentials.authenticationTag,
  encryptionKeyVersion: providerCredentials.encryptionKeyVersion,
  label: providerCredentials.label,
  lastFour: providerCredentials.lastFour,
  validationState: providerCredentials.validationState,
  validatedAt: providerCredentials.validatedAt,
  revokedAt: providerCredentials.revokedAt,
};

export function createProviderCredentialStore(
  provider: CredentialProvider,
): ProviderCredentialStore {
  return {
    async getForUser(userId) {
      const [credential] = await db
        .select(credentialSelection)
        .from(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.provider, provider),
          ),
        )
        .limit(1);

      return credential ?? null;
    },

    async upsertForUser(input) {
      const now = new Date();
      const [credential] = await db
        .insert(providerCredentials)
        .values({
          id: crypto.randomUUID(),
          userId: input.userId,
          provider: provider,
          ciphertext: input.ciphertext,
          nonce: input.nonce,
          authenticationTag: input.authenticationTag,
          encryptionKeyVersion: input.encryptionKeyVersion,
          label: input.label,
          lastFour: input.lastFour,
          validationState: "valid",
          validatedAt: input.validatedAt,
          validationErrorCode: null,
          revokedAt: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [providerCredentials.userId, providerCredentials.provider],
          set: {
            ciphertext: input.ciphertext,
            nonce: input.nonce,
            authenticationTag: input.authenticationTag,
            encryptionKeyVersion: input.encryptionKeyVersion,
            label: input.label,
            lastFour: input.lastFour,
            validationState: "valid",
            validatedAt: input.validatedAt,
            validationErrorCode: null,
            revokedAt: null,
            updatedAt: now,
          },
        })
        .returning(credentialSelection);

      if (!credential) {
        throw new Error("Credential replacement failed");
      }
      return credential;
    },

    async deleteForUser(userId) {
      const deleted = await db
        .delete(providerCredentials)
        .where(
          and(
            eq(providerCredentials.userId, userId),
            eq(providerCredentials.provider, provider),
          ),
        )
        .returning({ id: providerCredentials.id });

      return deleted.length > 0;
    },
  };
}

export const providerCredentialStore =
  createProviderCredentialStore("openrouter");
export const codexCredentialStore = createProviderCredentialStore("codex");
