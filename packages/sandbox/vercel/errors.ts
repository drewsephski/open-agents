import { SandboxProviderError, toErrorMessage } from "../errors.ts";

type SandboxOperation = SandboxProviderError["operation"];

function includesAny(message: string, values: string[]): boolean {
  return values.some((value) => message.includes(value));
}

export function classifyVercelSandboxError(
  error: unknown,
  operation: SandboxOperation,
): SandboxProviderError {
  const originalMessage = toErrorMessage(error);
  const message = originalMessage.toLowerCase();

  if (
    includesAny(message, [
      "insufficient credits",
      "credits exhausted",
      "credit balance",
      "quota exhausted",
      "payment required",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "quota_exhausted",
      operation,
      retryable: false,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "concurrent sandbox limit",
      "sandbox limit reached",
      "too many sandboxes",
      "account limit",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "account_limit",
      operation,
      retryable: true,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "provider capacity",
      "sandbox capacity",
      "service unavailable",
      "status code 503",
      "temporarily overloaded",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "provider_capacity",
      operation,
      retryable: true,
      fallbackSafe: operation === "provision",
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "status code 401",
      "unauthorized",
      "invalid token",
      "authentication",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "authentication",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "status code 404",
      "status code 410",
      "sandbox not found",
      "sandbox is stopped",
      "not_found",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "resource_not_found",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "missing project",
      "missing team",
      "not configured",
      "configuration",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "configuration",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "policy violation",
      "policy rejection",
      "not permitted",
      "forbidden",
      "status code 403",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
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
      "invalid source",
      "repository not found",
      "couldn't find remote ref",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "invalid_source",
      operation,
      retryable: false,
      fallbackSafe: false,
      cause: error,
    });
  }

  if (
    includesAny(message, [
      "bad gateway",
      "status code 502",
      "fetch failed",
      "connection reset",
      "timed out",
      "timeout",
    ])
  ) {
    return new SandboxProviderError(originalMessage, {
      provider: "vercel",
      errorClass: "transient_provisioning",
      operation,
      retryable: true,
      fallbackSafe: false,
      cause: error,
    });
  }

  return new SandboxProviderError(originalMessage, {
    provider: "vercel",
    errorClass: "unknown",
    operation,
    retryable: false,
    fallbackSafe: false,
    cause: error,
  });
}
