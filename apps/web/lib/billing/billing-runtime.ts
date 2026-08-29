import "server-only";
import {
  encryptCredential,
  loadCredentialKeyring,
} from "@/lib/credentials/envelope-encryption";
import { billingCustomerStore } from "./billing-customer-store";
import {
  getStripeSessionConfig,
  getStripeWebhookConfig,
} from "./billing-config";
import { createBillingEventProcessor } from "./billing-reconciliation";
import { createBillingSessionService } from "./billing-sessions";
import { billingStateStore } from "./billing-state-store";
import { createManagedKeyLifecycle } from "./managed-key-lifecycle";
import { managedInferenceKeyStore } from "./managed-key-store";
import { createOpenRouterManagementClient } from "./openrouter-management";
import { getStripeClient } from "./stripe-client";
import { createStripeSubscriptionReader } from "./stripe-subscription-reader";
import { createStripeWebhookHandler } from "./stripe-webhook";

export async function createProCheckoutSession(input: {
  userId: string;
  email: string | null;
}) {
  const config = getStripeSessionConfig();
  const service = createBillingSessionService({
    stripe: getStripeClient(config.secretKey),
    customerStore: billingCustomerStore,
    config,
  });
  return service.createCheckout(input);
}

export async function createCustomerPortalSession(input: { userId: string }) {
  const config = getStripeSessionConfig();
  const service = createBillingSessionService({
    stripe: getStripeClient(config.secretKey),
    customerStore: billingCustomerStore,
    config,
  });
  return service.createPortal(input);
}

export function getStripeWebhookHandler() {
  const config = getStripeWebhookConfig();
  const stripe = getStripeClient(config.secretKey);
  const keyring = loadCredentialKeyring();
  const managedKeys = createManagedKeyLifecycle({
    store: managedInferenceKeyStore,
    managementClient: createOpenRouterManagementClient({
      managementKey: config.openRouterManagementKey,
    }),
    encrypt: (plaintext, context) =>
      encryptCredential(plaintext, {
        keyring,
        userId: context.userId,
        provider: "openrouter",
      }),
  });
  const eventProcessor = createBillingEventProcessor({
    proPriceId: config.proPriceId,
    store: billingStateStore,
    stripe: createStripeSubscriptionReader({
      stripe,
      proPriceId: config.proPriceId,
    }),
    managedKeys,
  });
  return createStripeWebhookHandler({
    stripe,
    webhookSecret: config.webhookSecret,
    eventProcessor,
  });
}
