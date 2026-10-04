import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import type { VercelProjectSelection } from "@/lib/vercel/types";

mock.module("@/lib/access/access-summary", () => ({
  getAccessSummary: async () => ({
    sandbox: {
      remainingMilliseconds: 1000,
      runningSandboxCount: 0,
      concurrencyLimit: 2,
    },
  }),
}));
mock.module("@/lib/github/access", () => ({
  verifyRepoAccess: async () => ({ ok: true }),
  getRepoAccessErrorMessage: () => "Repository access required",
}));
let actionConnected = true;
let actionAccountId = "ca-1";
mock.module("@/lib/actions/runtime", () => ({
  getActionProvider: () => ({
    id: "composio",
    listAccounts: async () =>
      actionConnected
        ? [{ accountId: actionAccountId, label: "Account 1" }]
        : [],
  }),
}));

mock.module("server-only", () => ({}));

let selectedStack: import("@/lib/stacks/schema").StackSummary | undefined;
mock.module("@/lib/db/stacks", () => ({
  getOwnedStackVersion: async () => selectedStack,
}));
mock.module("@/lib/access/chat-backend", () => ({
  getNewChatBackend: async () => "launchstack_native",
}));

let currentSession: {
  authProvider?: "vercel" | "github";
  user: {
    id: string;
    username: string;
    name: string;
    email?: string;
  };
} | null = {
  user: {
    id: "user-1",
    username: "nico",
    name: "Nico",
  },
};
let existingSessionCount = 0;
let savedLink: VercelProjectSelection | null = null;
let currentVercelToken: string | null = "vercel-token";
let matchingProjects: VercelProjectSelection[] = [];
let matchingProjectsError: Error | null = null;
let inferenceAllowed = true;
const createCalls: Array<Record<string, unknown>> = [];
const upsertCalls: Array<Record<string, unknown>> = [];
const provisioningKickCalls: string[] = [];

const originalNodeEnv = process.env.NODE_ENV;

mock.module("@/lib/access/model-credential-resolver", () => ({
  resolveModelCredential: async () =>
    inferenceAllowed
      ? { allowed: true }
      : {
          allowed: false,
          failure: {
            code: "inference_source_required",
            remediation: ["add_byok", "upgrade_to_pro"],
          },
        },
  toInferenceAccessErrorResponse: (failure: unknown) =>
    Response.json({ error: failure }, { status: 403 }),
}));

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/random-city", () => ({
  getRandomCityName: () => "Oslo",
}));

mock.module("@/lib/db/user-preferences", () => ({
  getUserPreferences: async () => ({
    defaultModelId: APP_DEFAULT_MODEL_ID,
    defaultSubagentModelId: null,
    defaultSandboxType: "vercel",
    defaultDiffMode: "unified",
    autoCommitPush: false,
    autoCreatePr: false,
    alertsEnabled: true,
    alertSoundEnabled: true,
    publicUsageEnabled: false,
    globalSkillRefs: [{ source: "vercel/ai", skillName: "ai-sdk" }],
    modelVariants: [],
    enabledModelIds: [],
  }),
}));

mock.module("@/lib/db/vercel-project-links", () => ({
  getVercelProjectLinkByRepo: async () => savedLink,
  upsertVercelProjectLink: async (input: Record<string, unknown>) => {
    upsertCalls.push(input);
  },
}));

mock.module("@/lib/vercel/token", () => ({
  getUserVercelToken: async () => currentVercelToken,
}));

mock.module("@/lib/vercel/projects", () => ({
  isVercelProjectAccessError: () => false,
  isVercelInvalidTokenError: (error: unknown) =>
    matchingProjectsError !== null && error === matchingProjectsError,
  listMatchingVercelProjects: async () => {
    if (matchingProjectsError) {
      throw matchingProjectsError;
    }
    return matchingProjects;
  },
}));

mock.module("@/lib/db/sessions", () => ({
  countSessionsByUserId: async () => existingSessionCount,
  createSessionWithInitialChat: async (input: {
    session: Record<string, unknown>;
    initialChat: Record<string, unknown>;
  }) => {
    createCalls.push(input.session);
    return {
      session: {
        ...input.session,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      chat: {
        id: String(input.initialChat.id),
        sessionId: String(input.session.id),
        title: String(input.initialChat.title),
        modelId: String(input.initialChat.modelId),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  },
  getArchivedSessionCountByUserId: async () => 0,
  getSessionsWithUnreadByUserId: async () => [],
  getUsedSessionTitles: async () => new Set<string>(),
}));

mock.module("@/lib/sandbox/provisioning-kick", () => ({
  kickSandboxProvisioningWorkflow: async (sessionId: string) => {
    provisioningKickCalls.push(sessionId);
    return { status: "started", runId: `provision-${sessionId}` };
  },
}));

const routeModulePromise = import("./route");

function createJsonRequest(
  body: unknown,
  url = "http://localhost/api/sessions",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/sessions POST vercel project linking", () => {
  afterEach(() => {
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  });

  beforeEach(() => {
    selectedStack = undefined;
    actionConnected = true;
    actionAccountId = "ca-1";
    currentSession = {
      user: {
        id: "user-1",
        username: "nico",
        name: "Nico",
      },
    };
    existingSessionCount = 0;
    savedLink = null;
    currentVercelToken = "vercel-token";
    matchingProjects = [];
    matchingProjectsError = null;
    inferenceAllowed = true;
    createCalls.length = 0;
    upsertCalls.length = 0;
    provisioningKickCalls.length = 0;
  });

  test("rejects repository tasks without inference access before creating a session", async () => {
    inferenceAllowed = false;
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest({ repoOwner: "acme", repoName: "repo" }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      readiness: {
        ready: false,
        blockers: [
          {
            code: "inference_unavailable",
            reason: "inference_source_required",
          },
        ],
      },
    });
    expect(createCalls).toHaveLength(0);
    expect(provisioningKickCalls).toHaveLength(0);
  });

  test("blocks additional sessions for managed template trial users", async () => {
    const { POST } = await routeModulePromise;

    currentSession = {
      authProvider: "vercel",
      user: {
        id: "user-1",
        username: "nico",
        name: "Nico",
        email: "person@example.com",
      },
    };
    existingSessionCount = 1;

    const response = await POST(
      createJsonRequest(
        {
          branch: "main",
          cloneUrl: "https://github.com/vercel-labs/open-agents",
          repoOwner: "vercel-labs",
          repoName: "open-agents",
        },
        "https://open-agents.dev/api/sessions",
      ),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "This hosted demo includes 1 trial session. Deploy your own copy to unlock the full Launchstack template.",
    );
    expect(createCalls).toHaveLength(0);
  });

  test("blocks repo-backed sessions for trial users", async () => {
    const { POST } = await routeModulePromise;

    currentSession = {
      authProvider: "vercel",
      user: {
        id: "user-1",
        username: "nico",
        name: "Nico",
        email: "person@example.com",
      },
    };

    const response = await POST(
      createJsonRequest(
        {
          branch: "main",
          cloneUrl: "https://github.com/vercel-labs/open-agents",
          repoOwner: "vercel-labs",
          repoName: "open-agents",
        },
        "https://open-agents.dev/api/sessions",
      ),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "GitHub-backed sessions are disabled in the hosted demo. Deploy your own copy to unlock repository support, or start a new chat without a repository.",
    );
    expect(createCalls).toHaveLength(0);
  });

  test("explicit Vercel project is validated against live repo matches before it is persisted", async () => {
    const { POST } = await routeModulePromise;

    const vercelProject: VercelProjectSelection = {
      projectId: "project-1",
      projectName: "tampered-name",
      teamId: "team-x",
      teamSlug: "tampered-team",
    };
    matchingProjects = [
      {
        projectId: "project-1",
        projectName: "app",
        teamId: "team-1",
        teamSlug: "acme",
      },
    ];

    const response = await POST(
      createJsonRequest({
        repoOwner: "Vercel",
        repoName: "Open-Harness",
        branch: "main",
        cloneUrl: "https://github.com/Vercel/Open-Harness",
        vercelProject,
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toEqual([
      {
        userId: "user-1",
        repoOwner: "Vercel",
        repoName: "Open-Harness",
        project: matchingProjects[0],
      },
    ]);
    expect(createCalls[0]).toMatchObject({
      repoOwner: "Vercel",
      repoName: "Open-Harness",
      vercelProjectId: "project-1",
      vercelProjectName: "app",
      vercelTeamId: "team-1",
      vercelTeamSlug: "acme",
    });
    expect(body.session.vercelProjectId).toBe("project-1");
    expect(body.session.vercelProjectName).toBe("app");
    expect(provisioningKickCalls).toEqual([String(body.session.id)]);
  });

  test("rejects explicit Vercel projects that are not a live match for the repo", async () => {
    const { POST } = await routeModulePromise;

    matchingProjects = [
      {
        projectId: "project-2",
        projectName: "dashboard",
        teamId: null,
        teamSlug: null,
      },
    ];

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
        vercelProject: {
          projectId: "project-999",
          projectName: "rogue-project",
          teamId: null,
          teamSlug: null,
        },
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Selected Vercel project no longer matches this repository",
    );
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  test("omitting vercelProject falls back to the saved repo link", async () => {
    const { POST } = await routeModulePromise;

    savedLink = {
      projectId: "project-2",
      projectName: "dashboard",
      teamId: null,
      teamSlug: null,
    };

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls[0]).toMatchObject({
      vercelProjectId: "project-2",
      vercelProjectName: "dashboard",
      vercelTeamId: null,
      vercelTeamSlug: null,
    });
    expect(body.session.vercelProjectName).toBe("dashboard");
  });

  test("explicit null suppresses Vercel linking for that session", async () => {
    const { POST } = await routeModulePromise;

    savedLink = {
      projectId: "project-2",
      projectName: "dashboard",
      teamId: null,
      teamSlug: null,
    };

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
        vercelProject: null,
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls[0]).toMatchObject({
      vercelProjectId: null,
      vercelProjectName: null,
      vercelTeamId: null,
      vercelTeamSlug: null,
    });
    expect(body.session.vercelProjectId).toBeNull();
  });

  test("new sessions snapshot the user global skill refs", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      globalSkillRefs: [{ source: "vercel/ai", skillName: "ai-sdk" }],
    });
  });

  test("rejects invalid repository owners", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: 'vercel" && echo nope && "',
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid repository owner");
    expect(createCalls).toHaveLength(0);
  });

  test("persists autoCreatePr when autoCommitPush is enabled", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "feature/auto-pr",
        cloneUrl: "https://github.com/vercel/open-agents",
        autoCommitPush: true,
        autoCreatePr: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      autoCommitPushOverride: true,
      autoCreatePrOverride: true,
    });
  });

  test("persists the selected Mission for a repository session", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
        missionType: "fix_bug",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({ missionType: "fix_bug" });
  });

  test("defaults repository sessions to Ship a feature", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({ missionType: "ship_feature" });
  });

  test("keeps generic chat sessions on the custom Mission", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        missionType: "ship_feature",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({ missionType: "custom" });
  });

  test("launches an owned frozen Stack version with run-specific overrides", async () => {
    const configuration = buildDefaultStack(
      await getUserPreferences("user-1"),
      "launchstack_native",
    );
    configuration.missionType = "fix_build";
    configuration.instructions = "Repair CI only";
    configuration.globalSkillRefs = [];
    selectedStack = {
      id: "stack-1",
      name: "CI Repair",
      description: "",
      versionId: "version-2",
      version: 2,
      configuration,
    };
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest({
        repoOwner: "acme",
        repoName: "app",
        stackVersionId: "version-2",
        autoCommitPush: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      stackVersionId: "version-2",
      missionType: "fix_build",
      globalSkillRefs: [],
      stackSnapshot: {
        name: "CI Repair",
        version: 2,
        configuration: { instructions: "Repair CI only", autoCommitPush: true },
      },
    });
    expect(configuration.autoCommitPush).toBe(false);
  });

  test("unowned versions cannot silently fall back to the default", async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      createJsonRequest({ stackVersionId: "someone-elses-version" }),
    );
    expect(response.status).toBe(404);
    expect(createCalls).toHaveLength(0);
    expect(provisioningKickCalls).toHaveLength(0);
  });

  test("rejects unsupported Mission values", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "vercel",
        repoName: "open-agents",
        branch: "main",
        cloneUrl: "https://github.com/vercel/open-agents",
        missionType: "ship_without_checks",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Mission type");
    expect(createCalls).toHaveLength(0);
  });
});

test("launch API independently blocks missing Gmail before Session creation or provisioning", async () => {
  actionConnected = false;
  createCalls.length = 0;
  provisioningKickCalls.length = 0;
  const { POST } = await routeModulePromise;
  const response = await POST(createJsonRequest({}));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    readiness: {
      ready: false,
      blockers: [{ code: "connection_required", toolkit: "gmail" }],
    },
  });
  expect(createCalls).toHaveLength(0);
  expect(provisioningKickCalls).toHaveLength(0);
});

test("launch independently rejects missing Linear and never narrows a Stack", async () => {
  const configuration = buildDefaultStack(
    await getUserPreferences("user-1"),
    "launchstack_native",
  );
  configuration.actions.capabilities = [{ toolkit: "linear", access: "read" }];
  selectedStack = {
    id: "linear",
    versionId: "linear-v1",
    name: "Linear",
    description: "",
    version: 1,
    configuration,
  };
  actionConnected = false;
  createCalls.length = 0;
  provisioningKickCalls.length = 0;
  const { POST } = await routeModulePromise;
  const response = await POST(
    createJsonRequest({ stackVersionId: "linear-v1" }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    readiness: {
      blockers: [{ code: "connection_required", toolkit: "linear" }],
    },
  });
  expect(createCalls).toHaveLength(0);
  expect(provisioningKickCalls).toHaveLength(0);
});

test("launch rejects a stale displayed account while a new Session can select the replacement", async () => {
  selectedStack = undefined;
  actionConnected = true;
  actionAccountId = "ca-new";
  createCalls.length = 0;
  provisioningKickCalls.length = 0;
  const { POST } = await routeModulePromise;
  const rejected = await POST(
    createJsonRequest({ actionAccountIds: { gmail: "ca-1" } }),
  );
  expect(rejected.status).toBe(409);
  expect(createCalls).toHaveLength(0);
  expect(provisioningKickCalls).toHaveLength(0);
  const accepted = await POST(
    createJsonRequest({ actionAccountIds: { gmail: "ca-new" } }),
  );
  expect(accepted.status).toBe(200);
  expect(createCalls[0]).toMatchObject({
    actionBindings: { gmail: { accountId: "ca-new", label: "Account 1" } },
  });
  const snapshot = createCalls[0]?.stackSnapshot;
  expect(JSON.stringify(snapshot)).not.toContain("ca-new");
});

test("Codex Stacks require Codex without invoking native inference", async () => {
  const configuration = buildDefaultStack(
    await getUserPreferences("user-1"),
    "codex",
  );
  selectedStack = {
    id: "codex",
    versionId: "codex-v1",
    name: "Codex",
    description: "",
    version: 1,
    configuration,
  };
  createCalls.length = 0;
  const { POST } = await routeModulePromise;
  const response = await POST(
    createJsonRequest({ stackVersionId: "codex-v1" }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    readiness: { blockers: [{ code: "codex_required" }] },
  });
  expect(createCalls).toHaveLength(0);
});
