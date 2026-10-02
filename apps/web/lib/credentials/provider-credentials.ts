import "server-only";
import {
  encryptCredential,
  loadCredentialKeyring,
  type CredentialKeyring,
} from "./envelope-encryption";
import {
  validateOpenRouterCredential,
  type OpenRouterCredentialValidationResult,
} from "./openrouter-validation";
import {
  providerCredentialStore,
  type ProviderCredentialStore,
  type StoredProviderCredential,
} from "./provider-credential-store";

export interface SafeProviderCredentialStatus {
  state: "missing" | "pending" | "valid" | "invalid" | "revoked";
  label: string | null;
  lastFour: string | null;
  validatedAt: string | null;
}

interface ProviderCredentialServiceDependencies {
  keyring: CredentialKeyring | (() => CredentialKeyring);
  store: ProviderCredentialStore;
  validate: (apiKey: string) => Promise<OpenRouterCredentialValidationResult>;
  now?: () => Date;
}

export interface ProviderCredentialService {
  getOpenRouterCredentialStatus(
    userId: string,
  ): Promise<SafeProviderCredentialStatus>;
  replaceOpenRouterCredential(
    userId: string,
    apiKey: string,
  ): Promise<SafeProviderCredentialStatus>;
  deleteOpenRouterCredential(
    userId: string,
  ): Promise<SafeProviderCredentialStatus>;
}

const MISSING_CREDENTIAL_STATUS: SafeProviderCredentialStatus = {
  state: "missing",
  label: null,
  lastFour: null,
  validatedAt: null,
};

function toSafeStatus(
  credential: StoredProviderCredential,
): SafeProviderCredentialStatus {
  return {
    state: credential.validationState,
    label: credential.label,
    lastFour: credential.lastFour,
    validatedAt: credential.validatedAt?.toISOString() ?? null,
  };
}

export function createProviderCredentialService(
  dependencies: ProviderCredentialServiceDependencies,
): ProviderCredentialService {
  const now = dependencies.now ?? (() => new Date());
  const configuredKeyring = dependencies.keyring;
  const getKeyring =
    typeof configuredKeyring === "function"
      ? configuredKeyring
      : () => configuredKeyring;

  return {
    async getOpenRouterCredentialStatus(userId) {
      const credential = await dependencies.store.getForUser(userId);
      return credential ? toSafeStatus(credential) : MISSING_CREDENTIAL_STATUS;
    },

    async replaceOpenRouterCredential(userId, apiKey) {
      const validation = await dependencies.validate(apiKey);
      if (validation.state !== "valid") {
        return {
          state: validation.state,
          label: null,
          lastFour: null,
          validatedAt: null,
        };
      }

      const validatedAt = now();
      const envelope = encryptCredential(apiKey, {
        keyring: getKeyring(),
        userId,
        provider: "openrouter",
      });
      const stored = await dependencies.store.upsertForUser({
        userId,
        ...envelope,
        label: validation.label,
        lastFour: apiKey.slice(-4),
        validatedAt,
      });

      return toSafeStatus(stored);
    },

    async deleteOpenRouterCredential(userId) {
      await dependencies.store.deleteForUser(userId);
      return MISSING_CREDENTIAL_STATUS;
    },
  };
}

function getProductionService(): ProviderCredentialService {
  return createProviderCredentialService({
    keyring: loadCredentialKeyring,
    store: providerCredentialStore,
    validate: validateOpenRouterCredential,
  });
}

export async function getOpenRouterCredentialStatus(userId: string) {
  return getProductionService().getOpenRouterCredentialStatus(userId);
}

export async function replaceOpenRouterCredential(
  userId: string,
  apiKey: string,
) {
  return getProductionService().replaceOpenRouterCredential(userId, apiKey);
}

export async function deleteOpenRouterCredential(userId: string) {
  return getProductionService().deleteOpenRouterCredential(userId);
}
