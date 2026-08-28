import { isSandboxProviderError } from "@open-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSession,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { connectConfiguredSandbox } from "@/lib/sandbox/connect";
import {
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_VCPUS,
  SANDBOX_INACTIVITY_TIMEOUT_MS,
} from "@/lib/sandbox/config";
import {
  buildActiveLifecycleUpdate,
  buildHibernatedLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { kickSandboxLifecycleWorkflow } from "@/lib/sandbox/lifecycle-kick";
import {
  canOperateOnSandbox,
  clearSandboxResumeState,
  clearSandboxState,
  getProviderSandboxId,
  getSessionSandboxName,
  hasResumableSandboxState,
  hasRuntimeSandboxState,
  isSandboxState,
} from "@/lib/sandbox/utils";

interface SandboxLifecycleRequest {
  sessionId: string;
}

function getConnectOptions() {
  return {
    timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
    hibernationTimeoutMs: SANDBOX_INACTIVITY_TIMEOUT_MS,
    vcpus: DEFAULT_SANDBOX_VCPUS,
    ports: DEFAULT_SANDBOX_PORTS,
    resume: true,
  };
}

/** Pause the exact current provider and persist its durable restore metadata. */
export async function POST(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) return authResult.response;

  let body: SandboxLifecycleRequest;
  try {
    body = (await req.json()) as SandboxLifecycleRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId: body.sessionId,
    sandboxGuard: canOperateOnSandbox,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) return sessionContext.response;

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  try {
    const sandbox = await connectConfiguredSandbox(
      sandboxState,
      getConnectOptions(),
    );
    await sandbox.stop();
    const stoppedState = sandbox.getState?.();
    const clearedState = clearSandboxState(
      isSandboxState(stoppedState) ? stoppedState : sandboxState,
    );
    await updateSession(body.sessionId, {
      snapshotUrl: null,
      snapshotCreatedAt: null,
      sandboxState: clearedState,
      lifecycleVersion: getNextLifecycleVersion(sessionRecord.lifecycleVersion),
      ...buildHibernatedLifecycleUpdate(),
    });

    return Response.json({
      snapshotId: getProviderSandboxId(clearedState),
      provider: clearedState?.type,
      createdAt: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to pause sandbox: ${message}` },
      { status: 500 },
    );
  }
}

/** Resume only the persisted provider. Legacy snapshot rows remain Vercel-only. */
export async function PUT(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) return authResult.response;

  let body: SandboxLifecycleRequest;
  try {
    body = (await req.json()) as SandboxLifecycleRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId: body.sessionId,
  });
  if (!sessionContext.ok) return sessionContext.response;
  const { sessionRecord } = sessionContext;

  if (hasRuntimeSandboxState(sessionRecord.sandboxState)) {
    return Response.json({
      success: true,
      alreadyRunning: true,
      provider: sessionRecord.sandboxState?.type,
      restoredFrom: getProviderSandboxId(sessionRecord.sandboxState),
    });
  }

  const persistedState = isSandboxState(sessionRecord.sandboxState)
    ? sessionRecord.sandboxState
    : undefined;
  const hasProviderRestore = hasResumableSandboxState(persistedState);
  const legacySnapshotId = sessionRecord.snapshotUrl;
  if (!hasProviderRestore && !legacySnapshotId) {
    return Response.json(
      { error: "No sandbox available for resume" },
      { status: 404 },
    );
  }

  const restoreState =
    hasProviderRestore && persistedState
      ? persistedState
      : {
          type: "vercel" as const,
          sandboxName: getSessionSandboxName(body.sessionId),
          snapshotId: legacySnapshotId ?? undefined,
          restore: legacySnapshotId
            ? { kind: "snapshot" as const, snapshotId: legacySnapshotId }
            : undefined,
        };

  try {
    const sandbox = await connectConfiguredSandbox(restoreState, {
      ...getConnectOptions(),
      createIfMissing:
        restoreState.type === "vercel" &&
        restoreState.restore?.kind === "snapshot",
      persistent: true,
    });
    const nextState = sandbox.getState?.();
    const restoredState = isSandboxState(nextState) ? nextState : restoreState;

    await updateSession(body.sessionId, {
      sandboxState: restoredState,
      snapshotUrl: null,
      snapshotCreatedAt: null,
      lifecycleVersion: getNextLifecycleVersion(sessionRecord.lifecycleVersion),
      ...buildActiveLifecycleUpdate(restoredState),
    });
    kickSandboxLifecycleWorkflow({
      sessionId: body.sessionId,
      reason: "snapshot-restored",
    });

    return Response.json({
      success: true,
      provider: restoredState.type,
      restoredFrom:
        getProviderSandboxId(restoreState) ?? legacySnapshotId ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      hasProviderRestore &&
      isSandboxProviderError(error) &&
      error.errorClass === "resource_not_found"
    ) {
      await updateSession(body.sessionId, {
        sandboxState: clearSandboxResumeState(sessionRecord.sandboxState),
        ...buildHibernatedLifecycleUpdate(),
      });
      return Response.json(
        {
          error: "Saved sandbox is no longer available. Create a new sandbox.",
        },
        { status: 404 },
      );
    }
    return Response.json(
      { error: `Failed to restore sandbox: ${message}` },
      { status: 500 },
    );
  }
}
