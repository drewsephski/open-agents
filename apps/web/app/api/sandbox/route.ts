import {
  requireAuthenticatedUser,
  requireOwnedSession,
} from "@/app/api/sessions/_lib/session-context";
import { checkBotProtection } from "@/lib/botid";
import { updateSession } from "@/lib/db/sessions";
import { connectConfiguredSandbox } from "@/lib/sandbox/connect";
import { DEFAULT_SANDBOX_TIMEOUT_MS } from "@/lib/sandbox/config";
import { provisionSessionSandbox } from "@/lib/sandbox/provisioning";
import {
  canOperateOnSandbox,
  clearSandboxState,
  hasResumableSandboxState,
} from "@/lib/sandbox/utils";
import { getServerSession } from "@/lib/session/get-server-session";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

interface CreateSandboxRequest {
  sessionId?: string;
  /** Legacy client hint; operator configuration remains authoritative. */
  sandboxType?: "vercel" | "codesandbox";
}

export async function POST(req: Request) {
  let body: CreateSandboxRequest;
  try {
    body = (await req.json()) as CreateSandboxRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.sandboxType &&
    body.sandboxType !== "vercel" &&
    body.sandboxType !== "codesandbox"
  ) {
    return Response.json({ error: "Invalid sandbox type" }, { status: 400 });
  }
  if (!body.sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["sandbox-create", session.user.id]),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const sessionContext = await requireOwnedSession({
    userId: session.user.id,
    sessionId: body.sessionId,
  });
  if (!sessionContext.ok) return sessionContext.response;

  const startedAt = Date.now();
  const provisioned = await provisionSessionSandbox({
    sessionId: body.sessionId,
    userId: session.user.id,
  });

  return Response.json({
    createdAt: Date.now(),
    timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
    currentBranch: provisioned.currentBranch,
    workingDirectory: provisioned.workingDirectory,
    provider: provisioned.provider,
    selectionReason: provisioned.selectionReason,
    timing: { readyMs: Date.now() - startedAt },
  });
}

export async function DELETE(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) return authResult.response;

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["sandbox-delete", authResult.userId]),
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("sessionId" in body) ||
    typeof (body as Record<string, unknown>).sessionId !== "string"
  ) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const { sessionId } = body as { sessionId: string };
  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) return sessionContext.response;

  const { sessionRecord } = sessionContext;
  if (!canOperateOnSandbox(sessionRecord.sandboxState)) {
    return Response.json({ success: true, alreadyStopped: true });
  }

  const sandbox = await connectConfiguredSandbox(sessionRecord.sandboxState);
  await sandbox.stop();
  const persistedState = sandbox.getState?.();
  const clearedState =
    persistedState &&
    typeof persistedState === "object" &&
    "type" in persistedState
      ? clearSandboxState(persistedState as typeof sessionRecord.sandboxState)
      : clearSandboxState(sessionRecord.sandboxState);
  await updateSession(sessionId, {
    sandboxState: clearedState,
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleState:
      hasResumableSandboxState(clearedState) ||
      Boolean(sessionRecord.snapshotUrl)
        ? "hibernated"
        : "provisioning",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  });

  return Response.json({ success: true });
}
