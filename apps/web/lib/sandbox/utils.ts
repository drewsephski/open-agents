import type { SandboxState } from "@open-agents/sandbox";
import { SANDBOX_EXPIRES_BUFFER_MS } from "./config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getSandboxExpiresAt(state: unknown): number | undefined {
  if (!isRecord(state)) return undefined;
  return typeof state.expiresAt === "number" ? state.expiresAt : undefined;
}

export function isSandboxState(value: unknown): value is SandboxState {
  if (!isRecord(value)) return false;
  if (value.type === "vercel") {
    return (
      value.restore === undefined ||
      (isRecord(value.restore) &&
        ((value.restore.kind === "named" &&
          hasNonEmptyString(value.restore.sandboxName)) ||
          (value.restore.kind === "snapshot" &&
            hasNonEmptyString(value.restore.snapshotId))))
    );
  }
  if (value.type === "codesandbox") {
    return (
      value.restore === undefined ||
      (isRecord(value.restore) &&
        value.restore.kind === "hibernate" &&
        hasNonEmptyString(value.restore.sandboxId))
    );
  }
  return false;
}

export function getSessionSandboxName(sessionId: string): string {
  return `session_${sessionId}`;
}

export function getPersistentSandboxName(state: unknown): string | null {
  if (!isRecord(state) || state.type !== "vercel") return null;
  if (
    isRecord(state.restore) &&
    state.restore.kind === "named" &&
    hasNonEmptyString(state.restore.sandboxName)
  ) {
    return state.restore.sandboxName;
  }
  return hasNonEmptyString(state.sandboxName) ? state.sandboxName : null;
}

export function getProviderSandboxId(state: unknown): string | null {
  if (!isRecord(state)) return null;
  if (hasNonEmptyString(state.providerSandboxId)) {
    return state.providerSandboxId;
  }
  if (state.type === "vercel") {
    return (
      getPersistentSandboxName(state) ??
      (hasNonEmptyString(state.sandboxId) ? state.sandboxId : null)
    );
  }
  if (state.type === "codesandbox") {
    if (
      isRecord(state.restore) &&
      state.restore.kind === "hibernate" &&
      hasNonEmptyString(state.restore.sandboxId)
    ) {
      return state.restore.sandboxId;
    }
    return hasNonEmptyString(state.sandboxId) ? state.sandboxId : null;
  }
  return null;
}

export function getResumableSandboxName(state: unknown): string | null {
  return getProviderSandboxId(state);
}

export function hasResumableSandboxState(state: unknown): boolean {
  if (!isSandboxState(state)) return false;
  if (state.type === "vercel" && state.restore?.kind === "snapshot") {
    return true;
  }
  return getProviderSandboxId(state) !== null;
}

export function hasPausedSandboxState(state: unknown): boolean {
  return hasResumableSandboxState(state) && !hasRuntimeSandboxState(state);
}

export function hasRuntimeSandboxState(state: unknown): boolean {
  return (
    isSandboxState(state) &&
    getProviderSandboxId(state) !== null &&
    getSandboxExpiresAt(state) !== undefined
  );
}

export function isSandboxActive(
  state: SandboxState | null | undefined,
): state is SandboxState {
  if (!hasRuntimeSandboxState(state)) return false;
  const expiresAt = getSandboxExpiresAt(state);
  return (
    expiresAt !== undefined &&
    Date.now() < expiresAt - SANDBOX_EXPIRES_BUFFER_MS
  );
}

export function canOperateOnSandbox(
  state: SandboxState | null | undefined,
): state is SandboxState {
  return hasRuntimeSandboxState(state);
}

export function isSandboxNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status code 404") ||
    normalized.includes("sandbox not found")
  );
}

export function isSandboxUnavailableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("expected a stream of command data") ||
    normalized.includes("status code 410") ||
    normalized.includes("status code 404") ||
    normalized.includes("sandbox is stopped") ||
    normalized.includes("sandbox not found") ||
    normalized.includes("sandbox probe failed")
  );
}

/** Clear active-runtime fields while retaining the exact provider restore key. */
export function clearSandboxState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  if (!state) return null;

  if (state.type === "codesandbox") {
    const sandboxId = getProviderSandboxId(state);
    return {
      type: "codesandbox",
      ...(sandboxId
        ? {
            providerSandboxId: sandboxId,
            sandboxId,
            restore: { kind: "hibernate" as const, sandboxId },
          }
        : {}),
      ...(state.currentBranch ? { currentBranch: state.currentBranch } : {}),
    };
  }

  const named = getPersistentSandboxName(state);
  const snapshotId =
    state.restore?.kind === "snapshot"
      ? state.restore.snapshotId
      : state.snapshotId;
  return {
    type: "vercel",
    ...(named
      ? {
          providerSandboxId: named,
          sandboxName: named,
          restore: { kind: "named" as const, sandboxName: named },
        }
      : snapshotId
        ? {
            snapshotId,
            restore: { kind: "snapshot" as const, snapshotId },
          }
        : {}),
  };
}

export function clearSandboxResumeState(
  state: SandboxState | null | undefined,
): SandboxState | null {
  return state ? ({ type: state.type } as SandboxState) : null;
}

export function clearUnavailableSandboxState(
  state: SandboxState | null | undefined,
  message: string,
): SandboxState | null {
  return isSandboxNotFoundError(message)
    ? clearSandboxResumeState(state)
    : clearSandboxState(state);
}
