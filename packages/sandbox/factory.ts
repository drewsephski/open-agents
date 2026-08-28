import type { Sandbox, SandboxHooks } from "./interface.ts";
import type {
  SandboxCircuitBreaker,
  SandboxProviderAdapter,
  SandboxSelectionReason,
  SandboxTelemetry,
} from "./provider.ts";
import type { Source, SandboxStatus } from "./types.ts";
import { connectCodeSandbox } from "./codesandbox/connect.ts";
import { classifyCodeSandboxError } from "./codesandbox/errors.ts";
import type { CodeSandboxCredentials } from "./codesandbox/config.ts";
import type { CodeSandboxState } from "./codesandbox/state.ts";
import {
  type SandboxProvider,
  type SandboxProviderError,
  isSandboxProviderError,
} from "./errors.ts";
import { connectVercel } from "./vercel/connect.ts";
import { classifyVercelSandboxError } from "./vercel/errors.ts";
import type { VercelState } from "./vercel/state.ts";

export type { SandboxStatus };

export type SandboxState =
  | ({ type: "vercel" } & VercelState)
  | CodeSandboxState;

export type SandboxStateByProvider<TProvider extends SandboxProvider> = Extract<
  SandboxState,
  { type: TProvider }
>;

export interface SandboxProviderOptions {
  vercel?: { enabled?: boolean };
  codesandbox?: ({ enabled?: boolean } & CodeSandboxCredentials) | undefined;
}

/** Options shared by provider adapters. Provider-specific credentials stay here. */
export interface ConnectOptions {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  vcpus?: number;
  ports?: number[];
  baseSnapshotId?: string;
  resume?: boolean;
  createIfMissing?: boolean;
  persistent?: boolean;
  snapshotExpiration?: number;
  skipGitWorkspaceBootstrap?: boolean;
  hibernationTimeoutMs?: number;
  providerOrder?: SandboxProvider[];
  providerOptions?: SandboxProviderOptions;
  circuitBreaker?: SandboxCircuitBreaker;
  telemetry?: SandboxTelemetry;
  /** Test/extension injection. Every registered provider must be a real adapter. */
  providerAdapters?: Partial<ProviderAdapterMap>;
}

export interface SandboxConnectConfig {
  state: SandboxState;
  options?: ConnectOptions;
}

export interface SandboxProvisionRequest {
  source?: Source;
  /** Stable Vercel name. Other providers may ignore this provider-neutral key. */
  persistenceKey?: string;
}

export interface SandboxProvisionResult {
  sandbox: Sandbox;
  provider: SandboxProvider;
  reason: SandboxSelectionReason;
}

type ProviderAdapterMap = {
  [TProvider in SandboxProvider]: SandboxProviderAdapter<TProvider>;
};

const BUILT_IN_ADAPTERS: ProviderAdapterMap = {
  vercel: {
    provider: "vercel",
    isEnabled: (options) => options?.providerOptions?.vercel?.enabled !== false,
    connect: (state, options) => connectVercel(state, options),
    classifyError: classifyVercelSandboxError,
  },
  codesandbox: {
    provider: "codesandbox",
    isEnabled: (options) => {
      const config = options?.providerOptions?.codesandbox;
      return config?.enabled !== false && Boolean(config?.apiKey);
    },
    connect: (state, options) => connectCodeSandbox(state, options),
    classifyError: classifyCodeSandboxError,
  },
};

function getAdapter<TProvider extends SandboxProvider>(
  provider: TProvider,
  options?: ConnectOptions,
): SandboxProviderAdapter<TProvider> {
  const adapter =
    options?.providerAdapters?.[provider] ?? BUILT_IN_ADAPTERS[provider];
  return adapter as SandboxProviderAdapter<TProvider>;
}

function emit(
  options: ConnectOptions | undefined,
  event: Parameters<SandboxTelemetry>[0],
): void {
  try {
    options?.telemetry?.(event);
  } catch {
    // Observability must never change provider selection behavior.
  }
}

function normalizeError(
  adapter: SandboxProviderAdapter,
  error: unknown,
  operation: SandboxProviderError["operation"],
): SandboxProviderError {
  if (isSandboxProviderError(error)) return error;
  return adapter.classifyError(error, operation);
}

function createState(
  provider: SandboxProvider,
  request: SandboxProvisionRequest,
): SandboxState {
  if (provider === "vercel") {
    return {
      type: "vercel",
      ...(request.source ? { source: request.source } : {}),
      ...(request.persistenceKey
        ? {
            sandboxName: request.persistenceKey,
            restore: {
              kind: "named" as const,
              sandboxName: request.persistenceKey,
            },
          }
        : {}),
    };
  }

  return {
    type: "codesandbox",
    ...(request.source ? { source: request.source } : {}),
  };
}

function getEffectiveOrder(options?: ConnectOptions): SandboxProvider[] {
  const requested = options?.providerOrder ?? ["vercel", "codesandbox"];
  return requested.filter((provider, index) => {
    if (requested.indexOf(provider) !== index) return false;
    return getAdapter(provider, options).isEnabled(options);
  });
}

/** Connect or restore only the provider persisted in state. This never falls back. */
export async function connectSandbox(
  configOrState: SandboxConnectConfig | SandboxState,
  legacyOptions?: ConnectOptions,
): Promise<Sandbox> {
  const isConfig =
    typeof configOrState === "object" &&
    "state" in configOrState &&
    typeof configOrState.state === "object";
  const state = isConfig
    ? (configOrState as SandboxConnectConfig).state
    : (configOrState as SandboxState);
  const options = isConfig
    ? (configOrState as SandboxConnectConfig).options
    : legacyOptions;
  const adapter = getAdapter(state.type, options);
  const startedAt = Date.now();

  try {
    const sandbox = await adapter.connect(
      state as SandboxStateByProvider<typeof state.type>,
      options,
    );
    emit(options, {
      name: "sandbox.provider.restore",
      provider: state.type,
      success: true,
      latencyMs: Date.now() - startedAt,
    });
    return sandbox;
  } catch (error) {
    const normalized = normalizeError(adapter, error, "restore");
    emit(options, {
      name: "sandbox.provider.restore",
      provider: state.type,
      success: false,
      latencyMs: Date.now() - startedAt,
      errorClass: normalized.errorClass,
    });
    throw normalized;
  }
}

/**
 * Provision a new provider-neutral sandbox. Automatic fallback exists only in
 * this function; callers with persisted provider state must use connectSandbox.
 */
export async function provisionSandbox(
  request: SandboxProvisionRequest,
  options?: ConnectOptions,
): Promise<SandboxProvisionResult> {
  const order = getEffectiveOrder(options);
  if (order.length === 0) {
    throw new Error("No sandbox providers are enabled and configured");
  }

  let previous:
    | {
        provider: SandboxProvider;
        errorClass: SandboxProviderError["errorClass"] | "circuit_open";
      }
    | undefined;
  let lastError: SandboxProviderError | undefined;

  for (const [index, provider] of order.entries()) {
    const adapter = getAdapter(provider, options);
    const circuit = await options?.circuitBreaker?.getState(provider);
    const reason: SandboxSelectionReason =
      index === 0
        ? "primary"
        : previous?.errorClass === "circuit_open"
          ? "circuit-open"
          : "fallback";

    if (circuit?.isOpen) {
      emit(options, {
        name: "sandbox.provider.circuit",
        provider,
        state: "open",
        openedUntil: circuit.openedUntil,
        failureCount: circuit.failureCount,
      });
      previous = { provider, errorClass: "circuit_open" };
      continue;
    }

    if (previous) {
      emit(options, {
        name: "sandbox.provider.fallback",
        from: previous.provider,
        to: provider,
        errorClass: previous.errorClass,
      });
    }
    emit(options, { name: "sandbox.provider.attempt", provider, reason });
    const startedAt = Date.now();

    try {
      const state = createState(provider, request);
      const sandbox = await adapter.connect(
        state as SandboxStateByProvider<typeof provider>,
        options,
      );
      await options?.circuitBreaker?.recordSuccess(provider);
      emit(options, {
        name: "sandbox.provider.selected",
        provider,
        reason,
        latencyMs: Date.now() - startedAt,
      });
      return { sandbox, provider, reason };
    } catch (error) {
      const normalized = normalizeError(adapter, error, "provision");
      lastError = normalized;
      emit(options, {
        name: "sandbox.provider.failure",
        provider,
        errorClass: normalized.errorClass,
        retryable: normalized.retryable,
        fallbackSafe: normalized.fallbackSafe,
        latencyMs: Date.now() - startedAt,
      });
      const nextCircuit = await options?.circuitBreaker?.recordFailure(
        provider,
        normalized,
      );
      const fallbackSafe =
        normalized.fallbackSafe || Boolean(nextCircuit?.isOpen);
      const nextProvider = order[index + 1];
      if (!fallbackSafe || !nextProvider) throw normalized;
      previous = { provider, errorClass: normalized.errorClass };
    }
  }

  if (lastError) throw lastError;
  throw new Error("All configured sandbox providers have an open circuit");
}
