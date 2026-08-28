import "server-only";

import type { ConnectOptions, SandboxProvider } from "@open-agents/sandbox";
import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;
const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional(),
);
const booleanValue = z.preprocess(
  emptyStringToUndefined,
  z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
);

const providerConfigSchema = z.object({
  SANDBOX_PROVIDER_ORDER: optionalString,
  VERCEL_SANDBOX_ENABLED: booleanValue,
  CODESANDBOX_ENABLED: booleanValue,
  CSB_API_KEY: optionalString,
  CODESANDBOX_TEMPLATE_ID: optionalString,
  SANDBOX_CIRCUIT_FAILURE_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(3),
  SANDBOX_CIRCUIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(300_000),
  SANDBOX_CIRCUIT_OPEN_MS: z.coerce.number().int().min(1_000).default(120_000),
  SANDBOX_CIRCUIT_PROBE_LEASE_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(30_000),
});

export interface SandboxProviderConfig {
  providerOrder: SandboxProvider[];
  providerOptions: NonNullable<ConnectOptions["providerOptions"]>;
  circuit: {
    failureThreshold: number;
    windowMs: number;
    openMs: number;
    probeLeaseMs: number;
  };
}

function parseProviderOrder(value: string | undefined): SandboxProvider[] {
  const providers = (value ?? "vercel,codesandbox")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  const known = new Set<SandboxProvider>(["vercel", "codesandbox"]);
  if (providers.length === 0) {
    throw new Error(
      "SANDBOX_PROVIDER_ORDER must include at least one provider",
    );
  }
  if (providers.some((provider) => !known.has(provider as SandboxProvider))) {
    throw new Error(
      "SANDBOX_PROVIDER_ORDER supports only vercel and codesandbox",
    );
  }
  if (new Set(providers).size !== providers.length) {
    throw new Error("SANDBOX_PROVIDER_ORDER cannot contain duplicates");
  }
  return providers as SandboxProvider[];
}

export function getSandboxProviderConfig(
  environment: Record<string, string | undefined> = process.env,
): SandboxProviderConfig {
  const parsed = providerConfigSchema.parse(environment);
  const providerOrder = parseProviderOrder(parsed.SANDBOX_PROVIDER_ORDER);
  const codesandboxEnabled =
    parsed.CODESANDBOX_ENABLED ?? Boolean(parsed.CSB_API_KEY);

  if (codesandboxEnabled && !parsed.CSB_API_KEY) {
    throw new Error("CODESANDBOX_ENABLED=true requires CSB_API_KEY");
  }

  return {
    providerOrder,
    providerOptions: {
      vercel: { enabled: parsed.VERCEL_SANDBOX_ENABLED !== false },
      ...(parsed.CSB_API_KEY
        ? {
            codesandbox: {
              enabled: codesandboxEnabled,
              apiKey: parsed.CSB_API_KEY,
              ...(parsed.CODESANDBOX_TEMPLATE_ID
                ? { templateId: parsed.CODESANDBOX_TEMPLATE_ID }
                : {}),
            },
          }
        : {}),
    },
    circuit: {
      failureThreshold: parsed.SANDBOX_CIRCUIT_FAILURE_THRESHOLD,
      windowMs: parsed.SANDBOX_CIRCUIT_WINDOW_MS,
      openMs: parsed.SANDBOX_CIRCUIT_OPEN_MS,
      probeLeaseMs: parsed.SANDBOX_CIRCUIT_PROBE_LEASE_MS,
    },
  };
}

export function getConfiguredSandboxOptions(): Pick<
  ConnectOptions,
  "providerOrder" | "providerOptions"
> {
  const config = getSandboxProviderConfig();
  return {
    providerOrder: config.providerOrder,
    providerOptions: config.providerOptions,
  };
}
