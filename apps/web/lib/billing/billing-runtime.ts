import "server-only";
import {
  encryptCredential,
  loadCredentialKeyring,
} from "@/lib/credentials/envelope-encryption";
import { billingCustomerStore } from "./billing-customer-store";
import { billingCheckoutStore } from "./billing-checkout-store";
import {
  assertCheckoutReady,
  getCreemSessionConfig,
  getCreemWebhookConfig,
} from "./billing-config";
import { createBillingEventProcessor } from "./billing-reconciliation";
import { createBillingSessionService } from "./billing-sessions";
import { billingStateStore } from "./billing-state-store";
import { createManagedKeyLifecycle } from "./managed-key-lifecycle";
import { managedInferenceKeyStore } from "./managed-key-store";
import { createOpenRouterManagementClient } from "./openrouter-management";
import { createCreemBillingClient } from "./creem-client";
import { createCreemWebhookHandler } from "./creem-webhook";
function sessions() {
  const config = getCreemSessionConfig();
  return createBillingSessionService({
    provider: createCreemBillingClient(config).sessions,
    customerStore: billingCustomerStore,
    checkoutStore: billingCheckoutStore,
    config,
  });
}
export async function createProCheckoutSession(input: {
  userId: string;
  email: string | null;
}) {
  assertCheckoutReady();
  return sessions().createCheckout(input);
}
export async function createCustomerPortalSession(input: { userId: string }) {
  return sessions().createPortal(input);
}
export function getCreemWebhookHandler() {
  const config = getCreemWebhookConfig();
  const keyring = loadCredentialKeyring();
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim();
  if (!managementKey)
    throw new Error("OPENROUTER_MANAGEMENT_API_KEY is required");
  const managedKeys = createManagedKeyLifecycle({
    store: managedInferenceKeyStore,
    managementClient: createOpenRouterManagementClient({ managementKey }),
    encrypt: (plaintext, context) =>
      encryptCredential(plaintext, {
        keyring,
        userId: context.userId,
        provider: "openrouter",
      }),
  });
  const eventProcessor = createBillingEventProcessor({
    proProductId: config.proProductId,
    store: billingStateStore,
    provider: createCreemBillingClient(config),
    managedKeys,
  });
  return createCreemWebhookHandler({
    webhookSecret: config.webhookSecret,
    eventProcessor,
  });
}
