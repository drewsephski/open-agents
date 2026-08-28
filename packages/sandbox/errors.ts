export type SandboxProvider = "vercel" | "codesandbox";

export type SandboxErrorClass =
  | "quota_exhausted"
  | "account_limit"
  | "provider_capacity"
  | "transient_provisioning"
  | "authentication"
  | "configuration"
  | "policy_rejection"
  | "invalid_source"
  | "resource_not_found"
  | "application"
  | "unknown";

interface SandboxProviderErrorOptions {
  provider: SandboxProvider;
  errorClass: SandboxErrorClass;
  operation: "provision" | "connect" | "restore" | "command" | "lifecycle";
  retryable: boolean;
  fallbackSafe: boolean;
  cause?: unknown;
}

export class SandboxProviderError extends Error {
  readonly provider: SandboxProvider;
  readonly errorClass: SandboxErrorClass;
  readonly operation: SandboxProviderErrorOptions["operation"];
  readonly retryable: boolean;
  readonly fallbackSafe: boolean;

  constructor(message: string, options: SandboxProviderErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "SandboxProviderError";
    this.provider = options.provider;
    this.errorClass = options.errorClass;
    this.operation = options.operation;
    this.retryable = options.retryable;
    this.fallbackSafe = options.fallbackSafe;
  }
}

export function isSandboxProviderError(
  error: unknown,
): error is SandboxProviderError {
  return error instanceof SandboxProviderError;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
