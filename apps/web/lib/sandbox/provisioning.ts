import "server-only";

import {
  connectSandbox,
  isSandboxProviderError,
  provisionSandbox,
  type Sandbox,
  type SandboxState,
  type SandboxProvider,
  type SandboxSelectionReason,
} from "@open-agents/sandbox";
import {
  getSessionById,
  updateSessionIfNotArchived,
  type SessionRecord,
} from "@/lib/db/sessions";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  verifyRepoAccess,
  getRepoAccessErrorMessage,
} from "@/lib/github/access";
import {
  mintInstallationToken,
  revokeInstallationToken,
  type ScopedInstallationToken,
} from "@/lib/github/app";
import { getGitHubUserProfile } from "@/lib/github/users";
import {
  DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_VCPUS,
  SANDBOX_INACTIVITY_TIMEOUT_MS,
} from "@/lib/sandbox/config";
import {
  buildActiveLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { kickSandboxLifecycleWorkflow } from "@/lib/sandbox/lifecycle-kick";
import {
  getSessionSandboxName,
  hasResumableSandboxState,
  isSandboxState,
} from "@/lib/sandbox/utils";
import { getSandboxProviderConfig } from "@/lib/sandbox/provider-config";
import { sandboxProviderCircuit } from "@/lib/sandbox/provider-circuit";
import { emitSandboxTelemetry } from "@/lib/sandbox/telemetry";
import { installGlobalSkills } from "@/lib/skills/global-skill-installer";
import { eq } from "drizzle-orm";

type UserRecord = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
};

export type ProvisionSessionSandboxResult = {
  sandboxState: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
  didSetupWorkspace: boolean;
  provider: SandboxProvider;
  selectionReason: SandboxSelectionReason | "restore";
  session: SessionRecord;
};

export class SessionArchivedDuringProvisioningError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} was archived during sandbox provisioning`);
    this.name = "SessionArchivedDuringProvisioningError";
  }
}

async function getUserById(userId: string): Promise<UserRecord | null> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

function buildSandboxSource(session: SessionRecord): SandboxState["source"] {
  if (!session.cloneUrl) {
    return undefined;
  }

  const branchExistsOnOrigin = session.prNumber != null;
  const shouldCreateNewBranch = session.isNewBranch && !branchExistsOnOrigin;

  return {
    repo: session.cloneUrl,
    ...(shouldCreateNewBranch
      ? { newBranch: session.branch ?? undefined }
      : { branch: session.branch ?? "main" }),
  };
}

async function getGitUser(user: UserRecord) {
  const profile = await getGitHubUserProfile(user.id);
  const githubNoreplyEmail =
    profile?.externalUserId && profile.username
      ? `${profile.externalUserId}+${profile.username}@users.noreply.github.com`
      : undefined;

  return {
    name: user.name ?? profile?.username ?? user.username,
    email:
      githubNoreplyEmail ??
      user.email ??
      `${user.username}@users.noreply.github.com`,
  };
}

async function getSetupToken(params: {
  userId: string;
  session: SessionRecord;
}): Promise<ScopedInstallationToken | undefined> {
  if (!params.session.cloneUrl) {
    return undefined;
  }
  if (!params.session.repoOwner || !params.session.repoName) {
    throw new Error("Session is missing repository metadata");
  }

  const access = await verifyRepoAccess({
    userId: params.userId,
    owner: params.session.repoOwner,
    repo: params.session.repoName,
  });
  if (!access.ok) {
    throw new Error(getRepoAccessErrorMessage(access.reason));
  }

  return mintInstallationToken({
    installationId: access.installationId,
    repositoryIds: [access.repositoryId],
    permissions: { contents: "read" },
  });
}

async function installSessionGlobalSkills(params: {
  session: SessionRecord;
  sandbox: Sandbox;
  didSetupWorkspace: boolean;
}): Promise<void> {
  if (!params.didSetupWorkspace) {
    return;
  }

  const globalSkillRefs = params.session.globalSkillRefs ?? [];
  if (globalSkillRefs.length === 0) {
    return;
  }

  try {
    await installGlobalSkills({
      sandbox: params.sandbox,
      globalSkillRefs,
    });
  } catch (error) {
    console.error(
      `Failed to install global skills for session ${params.session.id}:`,
      error,
    );
  }
}

async function stopSandboxAfterArchiveRace(params: {
  sessionId: string;
  sandbox: Sandbox;
}): Promise<never> {
  try {
    await params.sandbox.stop();
  } catch (error) {
    console.error(
      `Failed to stop sandbox after session ${params.sessionId} was archived during provisioning:`,
      error,
    );
  }

  throw new SessionArchivedDuringProvisioningError(params.sessionId);
}

export async function provisionSessionSandbox(params: {
  sessionId: string;
  userId?: string;
}): Promise<ProvisionSessionSandboxResult> {
  const session = await getSessionById(params.sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (params.userId && session.userId !== params.userId) {
    throw new Error("Unauthorized");
  }
  if (session.status === "archived") {
    throw new Error("Session is archived");
  }

  const isPinnedRestore = hasResumableSandboxState(session.sandboxState);
  let didSetupWorkspace = !isPinnedRestore;
  const user = await getUserById(session.userId);
  if (!user) {
    throw new Error("User not found");
  }

  const gitUser = await getGitUser(user);
  const setupToken = await getSetupToken({
    userId: session.userId,
    session,
  });

  const providerConfig = getSandboxProviderConfig();
  const sharedOptions = {
    githubToken: setupToken?.token,
    gitUser,
    timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
    hibernationTimeoutMs: SANDBOX_INACTIVITY_TIMEOUT_MS,
    vcpus: DEFAULT_SANDBOX_VCPUS,
    ports: DEFAULT_SANDBOX_PORTS,
    baseSnapshotId: DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
    persistent: true,
    resume: true,
    createIfMissing: true,
    providerOrder: providerConfig.providerOrder,
    providerOptions: providerConfig.providerOptions,
    circuitBreaker: sandboxProviderCircuit,
    telemetry: emitSandboxTelemetry,
  } as const;

  let sandbox: Sandbox;
  let provider: SandboxProvider;
  let selectionReason: SandboxSelectionReason | "restore";
  try {
    if (isPinnedRestore && isSandboxState(session.sandboxState)) {
      try {
        sandbox = await connectSandbox({
          state: session.sandboxState,
          options: { ...sharedOptions, createIfMissing: false },
        });
        provider = session.sandboxState.type;
        selectionReason = "restore";
      } catch (error) {
        const shouldRebuildPinnedVercel =
          session.sandboxState.type === "vercel" &&
          isSandboxProviderError(error) &&
          error.errorClass === "resource_not_found";
        if (!shouldRebuildPinnedVercel) {
          throw error;
        }

        const provisioned = await provisionSandbox(
          {
            source: buildSandboxSource(session),
            persistenceKey: getSessionSandboxName(session.id),
          },
          {
            ...sharedOptions,
            providerOrder: ["vercel"],
          },
        );
        sandbox = provisioned.sandbox;
        provider = provisioned.provider;
        selectionReason = provisioned.reason;
        didSetupWorkspace = true;
      }
    } else {
      const provisioned = await provisionSandbox(
        {
          source: buildSandboxSource(session),
          persistenceKey: getSessionSandboxName(session.id),
        },
        sharedOptions,
      );
      sandbox = provisioned.sandbox;
      provider = provisioned.provider;
      selectionReason = provisioned.reason;
    }
  } finally {
    if (setupToken) {
      await revokeInstallationToken(setupToken.token);
    }
  }

  const rawSandboxState = sandbox.getState?.();
  const sandboxState = isSandboxState(rawSandboxState)
    ? rawSandboxState
    : ({ type: provider } as SandboxState);

  const updatedSession = await updateSessionIfNotArchived(params.sessionId, {
    sandboxState,
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleVersion: getNextLifecycleVersion(session.lifecycleVersion),
    lifecycleError: null,
    ...buildActiveLifecycleUpdate(sandboxState),
  });

  if (!updatedSession) {
    await stopSandboxAfterArchiveRace({
      sessionId: params.sessionId,
      sandbox,
    });
  }

  await installSessionGlobalSkills({
    session,
    sandbox,
    didSetupWorkspace,
  });

  kickSandboxLifecycleWorkflow({
    sessionId: params.sessionId,
    reason: "sandbox-created",
  });

  return {
    sandboxState,
    workingDirectory: sandbox.workingDirectory,
    currentBranch: sandbox.currentBranch,
    environmentDetails: sandbox.environmentDetails,
    didSetupWorkspace,
    provider,
    selectionReason,
    session: updatedSession ?? session,
  };
}
