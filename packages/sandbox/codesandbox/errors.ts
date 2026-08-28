import { SandboxProviderError, toErrorMessage } from "../errors.ts";

type SandboxOperation = SandboxProviderError["operation"];

function includesAny(message: string, values: string[]): boolean {
  return values.some((value) => message.includes(value));
}

function getErrorType(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("type" in error)) {
    return undefined;
  }
  return typeof error.type === "string" ? error.type : undefined;
}

export function classifyCodeSandboxError(
  error: unknown,
  operation: SandboxOperation,
): SandboxProviderError {
  const originalMessage = toErrorMessage(error);
  const message = originalMessage.toLowerCase();
  const errorType = getErrorType(error);

  if (
    includesAny(message, [
      "credits exhausted",
      "credit balance",
      "out of credits",
      "quota exhausted",
      "payment required",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "quota_exhausted",
      operation,
      retryable: false,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (
    errorType === "rate-limit" &&
    includesAny(message, [
      "concurrently running vms remaining",
      "sandboxes remaining",
      "sandbox-hourly",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "account_limit",
      operation,
      retryable: true,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "currently overloaded",
      "service unavailable",
      "provider capacity",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "provider_capacity",
      operation,
      retryable: true,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (includesAny(message, ["unauthorized", "invalid api key", "status 401"])) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "authentication",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "status 404",
      "status 410",
      "sandbox not found",
      "sandbox is stopped",
      "lost its hibernation snapshot",
      "not_found",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "resource_not_found",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "csb_api_key",
      "api key is required",
      "missing api key",
      "not configured",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "configuration",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "forbidden",
      "not permitted",
      "permission denied",
      "policy",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "policy_rejection",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "failed to clone repository",
      "repository not found",
      "couldn't find remote ref",
      "invalid source",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "invalid_source",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    errorType === "rate-limit" ||
    includesAny(message, [
      "bad gateway",
      "status 502",
      "fetch failed",
      "connection reset",
      "timed out",
      "timeout",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "codesandbox",
      errorClass: "transient_provisioning",
      operation,
      retryable: true,
      fallbackSafe: false,
      cause: error,
    });
  }

  return new SandboxProviderError(originalMessage, {
    provider: "codesandbox",
    errorClass: "unknown",
    operation,
    retryable: false,
    fallbackSafe: false,
    cause: error,
  });
}
