import "server-only";
import { loadCredentialKeyring } from "@/lib/credentials/envelope-encryption";

type BillingEnvironment = Readonly<Record<string, string | undefined>>;
function requiredValue(environment: BillingEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}
export function getBillingAppOrigin(
  environment: BillingEnvironment = process.env,
): string {
  const value =
    environment.LAUNCHSTACK_APP_ORIGIN ??
    environment.BETTER_AUTH_URL ??
    environment.VERCEL_PROJECT_PRODUCTION_URL ??
    environment.VERCEL_URL;
  if (value)
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  if (environment.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("LAUNCHSTACK_APP_ORIGIN environment variable is required");
}
export function getCreemSessionConfig(
  environment: BillingEnvironment = process.env,
) {
  const apiKey = requiredValue(environment, "CREEM_API_KEY");
  const testMode = apiKey.startsWith("creem_test_");
  if (
    environment.CREEM_MODE &&
    environment.CREEM_MODE !== (testMode ? "test" : "live")
  )
    throw new Error("Creem key and environment do not match");
  return {
    apiKey,
    testMode,
    proProductId: requiredValue(environment, "CREEM_PRO_PRODUCT_ID"),
    appOrigin: getBillingAppOrigin(environment),
  };
}
export function isLiveCheckoutEnabled(
  environment: BillingEnvironment = process.env,
): boolean {
  return (
    environment.CREEM_API_KEY?.startsWith("creem_test_") === true ||
    environment.CREEM_LIVE_PAYMENTS_ENABLED === "true"
  );
}

export function assertCheckoutReady(
  environment: BillingEnvironment = process.env,
): void {
  getCreemWebhookConfig(environment);
  if (!isLiveCheckoutEnabled(environment))
    throw new Error("Creem live payments are not enabled");
  requiredValue(environment, "OPENROUTER_MANAGEMENT_API_KEY");
  loadCredentialKeyring(environment);
}
export function getCreemWebhookConfig(
  environment: BillingEnvironment = process.env,
) {
  return {
    ...getCreemSessionConfig(environment),
    webhookSecret: requiredValue(environment, "CREEM_WEBHOOK_SECRET"),
  };
}
