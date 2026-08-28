import "server-only";

const OPENROUTER_CURRENT_KEY_URL = "https://openrouter.ai/api/v1/key";
const VALIDATION_TIMEOUT_MS = 10_000;

interface OpenRouterValidationDependencies {
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

export type OpenRouterCredentialValidationResult =
  | { state: "valid"; label: string }
  | { state: "invalid" | "revoked" };

export class OpenRouterValidationUnavailableError extends Error {
  readonly code = "openrouter_validation_unavailable";

  constructor() {
    super("OpenRouter credential validation is unavailable");
    this.name = "OpenRouterValidationUnavailableError";
  }
}

function normalizeProviderLabel(label: string): string {
  return label.replaceAll(/\s+/g, " ").trim().slice(0, 80);
}

function getProviderLabel(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    typeof body.data === "object" &&
    body.data !== null &&
    "label" in body.data &&
    typeof body.data.label === "string" &&
    body.data.label.trim()
  ) {
    return normalizeProviderLabel(body.data.label);
  }
  return "OpenRouter key";
}

export async function validateOpenRouterCredential(
  apiKey: string,
  dependencies: OpenRouterValidationDependencies = {},
): Promise<OpenRouterCredentialValidationResult> {
  const fetchImplementation = dependencies.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImplementation(OPENROUTER_CURRENT_KEY_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });
  } catch {
    throw new OpenRouterValidationUnavailableError();
  }

  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    return { state: "invalid" };
  }
  if (response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    return { state: "revoked" };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new OpenRouterValidationUnavailableError();
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OpenRouterValidationUnavailableError();
  }

  const label = getProviderLabel(body);
  return {
    state: "valid",
    label: label.includes(apiKey) ? "OpenRouter key" : label,
  };
}
