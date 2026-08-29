import "server-only";

type BillingEnvironment = Readonly<Record<string, string | undefined>>;

function requiredValue(environment: BillingEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function normalizeOrigin(value: string): string {
  const withProtocol =
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;
  const url = new URL(withProtocol);
  return url.origin;
}

export function getBillingAppOrigin(
  environment: BillingEnvironment = process.env,
): string {
  const configuredOrigin =
    environment.LAUNCHSTACK_APP_ORIGIN ??
    environment.BETTER_AUTH_URL ??
    environment.VERCEL_PROJECT_PRODUCTION_URL ??
    environment.VERCEL_URL;
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }
  if (environment.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  throw new Error("LAUNCHSTACK_APP_ORIGIN environment variable is required");
}

export function getStripeSessionConfig(
  environment: BillingEnvironment = process.env,
) {
  return {
    secretKey: requiredValue(environment, "STRIPE_SECRET_KEY"),
    proPriceId: requiredValue(environment, "STRIPE_PRO_PRICE_ID"),
    appOrigin: getBillingAppOrigin(environment),
  };
}

export function getStripeWebhookConfig(
  environment: BillingEnvironment = process.env,
) {
  return {
    ...getStripeSessionConfig(environment),
    webhookSecret: requiredValue(environment, "STRIPE_WEBHOOK_SECRET"),
    openRouterManagementKey: requiredValue(
      environment,
      "OPENROUTER_MANAGEMENT_API_KEY",
    ),
  };
}
