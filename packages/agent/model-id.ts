export const DEFAULT_OPENROUTER_MODEL_ID = "z-ai/glm-5.3-flash";
export const OPENROUTER_APP_NAME = "Launchstack";
export const OPENROUTER_APP_URL = "https://launchstack.sh";

export type ModelId = string;

export class MissingOpenRouterApiKeyError extends Error {
  constructor() {
    super(
      "OPENROUTER_API_KEY is not configured. Set OPENROUTER_API_KEY to use OpenRouter as the model provider.",
    );
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

export function requireOpenRouterApiKey(
  apiKey: string | undefined = process.env.OPENROUTER_API_KEY,
): string {
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
