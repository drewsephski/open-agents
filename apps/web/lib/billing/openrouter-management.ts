import "server-only";
import { z } from "zod";

const OPENROUTER_MANAGEMENT_BASE_URL = "https://openrouter.ai/api/v1/keys";

const createKeyResponseSchema = z.object({
  data: z.object({
    hash: z.string().min(1),
    label: z.string().min(1),
    disabled: z.boolean(),
  }),
  key: z.string().min(1),
});

const listKeysResponseSchema = z.object({
  data: z.array(
    z.object({
      hash: z.string().min(1),
      name: z.string().min(1),
      disabled: z.boolean(),
    }),
  ),
});

export interface OpenRouterManagementClient {
  createKey(input: { name: string; expiresAt: Date }): Promise<{
    providerKeyId: string;
    plaintext: string;
    label: string;
  }>;
  disableKey(providerKeyId: string): Promise<void>;
  findKeyIdsByName(name: string): Promise<string[]>;
}

interface OpenRouterManagementDependencies {
  managementKey: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export class OpenRouterManagementError extends Error {
  constructor(code: "management_unavailable" | "management_response_invalid") {
    super(code);
    this.name = "OpenRouterManagementError";
  }
}

export function createOpenRouterManagementClient(
  dependencies: OpenRouterManagementDependencies,
): OpenRouterManagementClient {
  const fetchImplementation = dependencies.fetch ?? fetch;

  async function request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImplementation(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${dependencies.managementKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new OpenRouterManagementError("management_unavailable");
    }
    if (!response.ok) {
      throw new OpenRouterManagementError("management_unavailable");
    }
    return response;
  }

  return {
    async createKey(input) {
      const response = await request(OPENROUTER_MANAGEMENT_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          expires_at: input.expiresAt.toISOString(),
          include_byok_in_limit: false,
          limit: 10,
          limit_reset: "monthly",
        }),
      });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OpenRouterManagementError("management_response_invalid");
      }
      const parsed = createKeyResponseSchema.safeParse(payload);
      if (!parsed.success || parsed.data.data.disabled) {
        throw new OpenRouterManagementError("management_response_invalid");
      }
      return {
        providerKeyId: parsed.data.data.hash,
        plaintext: parsed.data.key,
        label: parsed.data.data.label,
      };
    },

    async disableKey(providerKeyId) {
      await request(
        `${OPENROUTER_MANAGEMENT_BASE_URL}/${encodeURIComponent(providerKeyId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ disabled: true }),
        },
      );
    },

    async findKeyIdsByName(name) {
      const matchingIds: string[] = [];
      let offset = 0;
      while (true) {
        const response = await request(
          `${OPENROUTER_MANAGEMENT_BASE_URL}?include_disabled=true&offset=${offset}`,
          { method: "GET" },
        );
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new OpenRouterManagementError("management_response_invalid");
        }
        const parsed = listKeysResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new OpenRouterManagementError("management_response_invalid");
        }
        for (const key of parsed.data.data) {
          if (key.name === name && !key.disabled) {
            matchingIds.push(key.hash);
          }
        }
        if (parsed.data.data.length < 100) {
          return matchingIds;
        }
        offset += parsed.data.data.length;
      }
    },
  };
}
