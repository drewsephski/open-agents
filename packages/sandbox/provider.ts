import type { Sandbox } from "./interface.ts";
import type {
  ConnectOptions,
  SandboxState,
  SandboxStateByProvider,
} from "./factory.ts";
import type {
  SandboxErrorClass,
  SandboxProvider,
  SandboxProviderError,
} from "./errors.ts";

export interface SandboxProviderCircuitState {
  isOpen: boolean;
  openedUntil?: number;
  failureCount: number;
}

export interface SandboxCircuitBreaker {
  getState(provider: SandboxProvider): Promise<SandboxProviderCircuitState>;
  recordSuccess(provider: SandboxProvider): Promise<void>;
  recordFailure(
    provider: SandboxProvider,
    error: SandboxProviderError,
  ): Promise<SandboxProviderCircuitState>;
}

export type SandboxSelectionReason = "primary" | "fallback" | "circuit-open";

export type SandboxTelemetryEvent =
  | {
      name: "sandbox.provider.attempt";
      provider: SandboxProvider;
      reason: SandboxSelectionReason;
    }
  | {
      name: "sandbox.provider.selected";
      provider: SandboxProvider;
      reason: SandboxSelectionReason;
      latencyMs: number;
    }
  | {
      name: "sandbox.provider.failure";
      provider: SandboxProvider;
      errorClass: SandboxErrorClass;
      retryable: boolean;
      fallbackSafe: boolean;
      latencyMs: number;
    }
  | {
      name: "sandbox.provider.circuit";
      provider: SandboxProvider;
      state: "open" | "closed";
      openedUntil?: number;
      failureCount: number;
    }
  | {
      name: "sandbox.provider.circuit.bookkeeping";
      provider: SandboxProvider;
      operation: "record_success";
      success: false;
    }
  | {
      name: "sandbox.provider.fallback";
      from: SandboxProvider;
      to: SandboxProvider;
      errorClass: SandboxErrorClass | "circuit_open";
    }
  | {
      name: "sandbox.provider.restore";
      provider: SandboxProvider;
      success: boolean;
      latencyMs: number;
      errorClass?: SandboxErrorClass;
    };

export type SandboxTelemetry = (event: SandboxTelemetryEvent) => void;

export interface SandboxProviderAdapter<
  TProvider extends SandboxProvider = SandboxProvider,
> {
  readonly provider: TProvider;
  isEnabled(options?: ConnectOptions): boolean;
  connect(
    state: SandboxStateByProvider<TProvider>,
    options?: ConnectOptions,
  ): Promise<Sandbox>;
  classifyError(
    error: unknown,
    operation: "provision" | "connect" | "restore" | "command" | "lifecycle",
  ): SandboxProviderError;
}

/**
 * Typed extension seam for future providers such as Modal. A provider must
 * supply a real state branch, adapter, and classifier before registration.
 */
export interface SandboxProviderRegistration<
  TState extends SandboxState = SandboxState,
> {
  provider: TState["type"];
  connect(state: TState, options?: ConnectOptions): Promise<Sandbox>;
  classifyError: SandboxProviderAdapter["classifyError"];
}
