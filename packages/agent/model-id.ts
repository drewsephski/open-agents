export const DEFAULT_OPENROUTER_MODEL_ID = "openai/gpt-6.1-sol";
export const OPENROUTER_APP_NAME = "Launchstack";
export const OPENROUTER_APP_URL = "https://launchstack.sh";

export type ModelId = string;

export class MissingOpenRouterApiKeyError extends Error {
  constructor() {
    super("Explicit OpenRouter API key configuration is required.");
    this.name = "MissingOpenRouterApiKeyError";
  }
}

export function resolveDefaultModelId(
  env: NodeJS.Dict<string> = process.env,
): ModelId {
  const override = env.OPENROUTER_MODEL?.trim();
  if (override) {
    return override;
  }
  return DEFAULT_OPENROUTER_MODEL_ID;
}

export function requireOpenRouterApiKey(apiKey: string | undefined): string {
  const trimmed = apiKey?.trim();
  if (!trimmed) {
    throw new MissingOpenRouterApiKeyError();
  }
  return trimmed;
}

export function resolveCanonicalAppUrl(
  explicit?: string,
  env: NodeJS.Dict<string> = process.env,
): string {
  if (explicit) {
    return explicit;
  }

  const host =
    env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
    env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) {
    return OPENROUTER_APP_URL;
  }

  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }

  return `https://${host}`;
}
