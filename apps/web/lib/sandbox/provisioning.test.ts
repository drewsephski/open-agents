import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const connectCalls: unknown[][] = [];
const provisionCalls: unknown[][] = [];
const revokeCalls: string[] = [];
const updateCalls: unknown[][] = [];
const installCalls: unknown[] = [];
let updateResult: Record<string, unknown> | null;
let stopCalls = 0;
let sessionState: Record<string, unknown>;
let connectError: Error | null;
let provisionProvider: "vercel" | "codesandbox";
let provisionReason: "primary" | "fallback";
let globalSkillRefs: Array<{ source: string; skillName: string }>;

function sandbox(provider: "vercel" | "codesandbox") {
  const state =
    provider === "vercel"
      ? {
          type: "vercel" as const,
          providerSandboxId: "session_session-1",
          sandboxName: "session_session-1",
          restore: {
            kind: "named" as const,
            sandboxName: "session_session-1",
          },
          expiresAt: Date.now() + 60_000,
        }
      : {
          type: "codesandbox" as const,
          providerSandboxId: "csb-1",
          sandboxId: "csb-1",
          restore: { kind: "hibernate" as const, sandboxId: "csb-1" },
          expiresAt: Date.now() + 60_000,
        };
  return {
    type: "cloud" as const,
    provider,
    workingDirectory: "/workspace",
    currentBranch: "main",
    environmentDetails: `provider=${provider}`,
    getState: () => state,
    stop: async () => {
      stopCalls += 1;
    },
  };
}

mock.module("@open-agents/sandbox", () => ({
  isSandboxProviderError: (error: unknown) =>
    error instanceof Error && "errorClass" in error,
  connectSandbox: async (...args: unknown[]) => {
    connectCalls.push(args);
    if (connectError) {
      throw connectError;
    }
    return sandbox(provisionProvider);
  },
  provisionSandbox: async (...args: unknown[]) => {
    provisionCalls.push(args);
    return {
      sandbox: sandbox(provisionProvider),
      provider: provisionProvider,
      reason: provisionReason,
    };
  },
}));
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({
    id: "session-1",
    userId: "user-1",
    status: "running",
    lifecycleVersion: 1,
    sandboxState: sessionState,
    cloneUrl: "https://github.com/acme/repo.git",
    repoOwner: "acme",
    repoName: "repo",
    branch: "main",
    prNumber: null,
    isNewBranch: false,
    globalSkillRefs,
  }),
  updateSessionIfNotArchived: async (...args: unknown[]) => {
    updateCalls.push(args);
    return updateResult;
  },
}));
mock.module("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "user-1",
              username: "nico",
              name: "Nico",
              email: "nico@example.com",
            },
          ],
        }),
      }),
    }),
  },
}));
mock.module("@/lib/db/schema", () => ({ users: { id: "id" } }));
mock.module("drizzle-orm", () => ({ eq: () => ({}) }));
mock.module("@/lib/github/access", () => ({
  verifyRepoAccess: async () => ({
    ok: true,
    installationId: 1,
    repositoryId: 2,
  }),
  getRepoAccessErrorMessage: () => "access denied",
}));
mock.module("@/lib/github/app", () => ({
  mintInstallationToken: async () => ({
    token: "scoped-token",
    installationId: 1,
    repositoryIds: [2],
    permissions: { contents: "read" },
  }),
  revokeInstallationToken: async (token: string) => {
    revokeCalls.push(token);
  },
}));
mock.module("@/lib/github/users", () => ({
  getGitHubUserProfile: async () => ({
    externalUserId: "123",
    username: "nico",
  }),
}));
mock.module("@/lib/sandbox/provider-config", () => ({
  getSandboxProviderConfig: () => ({
    providerOrder: ["vercel", "codesandbox"],
    providerOptions: {
      vercel: { enabled: true },
      codesandbox: { enabled: true, apiKey: "test" },
    },
  }),
}));
mock.module("@/lib/sandbox/provider-circuit", () => ({
  sandboxProviderCircuit: {},
}));
mock.module("@/lib/sandbox/telemetry", () => ({
  emitSandboxTelemetry: () => {},
}));
mock.module("@/lib/sandbox/lifecycle", () => ({
  buildActiveLifecycleUpdate: () => ({ lifecycleState: "active" }),
  getNextLifecycleVersion: (value: number) => value + 1,
}));
mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: () => {},
}));
mock.module("@/lib/skills/global-skill-installer", () => ({
  installGlobalSkills: async (input: unknown) => {
    installCalls.push(input);
  },
}));

const provisioningModulePromise = import("./provisioning");

describe("session sandbox provisioning", () => {
  beforeEach(() => {
    connectCalls.length = 0;
    provisionCalls.length = 0;
    revokeCalls.length = 0;
    updateCalls.length = 0;
    installCalls.length = 0;
    stopCalls = 0;
    sessionState = { type: "vercel" };
    connectError = null;
    provisionProvider = "codesandbox";
    provisionReason = "fallback";
    globalSkillRefs = [];
    updateResult = { id: "session-1" };
  });

  test("treats a bare legacy Vercel stub as unpinned and persists fallback state", async () => {
    const { provisionSessionSandbox } = await provisioningModulePromise;
    const result = await provisionSessionSandbox({
      sessionId: "session-1",
      userId: "user-1",
    });

    expect(connectCalls).toHaveLength(0);
    expect(provisionCalls[0]?.[0]).toMatchObject({
      persistenceKey: "session_session-1",
      source: {
        repo: "https://github.com/acme/repo.git",
        branch: "main",
      },
    });
    expect(provisionCalls[0]?.[1]).toMatchObject({
      githubToken: "scoped-token",
      providerOrder: ["vercel", "codesandbox"],
    });
    expect(updateCalls[0]?.[1]).toMatchObject({
      sandboxState: {
        type: "codesandbox",
        providerSandboxId: "csb-1",
      },
    });
    expect(revokeCalls).toEqual(["scoped-token"]);
    expect(result).toMatchObject({
      provider: "codesandbox",
      selectionReason: "fallback",
      didSetupWorkspace: true,
    });
  });

  test("restores a pinned CodeSandbox session only on its original provider", async () => {
    sessionState = {
      type: "codesandbox",
      providerSandboxId: "csb-1",
      restore: { kind: "hibernate", sandboxId: "csb-1" },
    };
    const { provisionSessionSandbox } = await provisioningModulePromise;
    const result = await provisionSessionSandbox({ sessionId: "session-1" });

    expect(provisionCalls).toHaveLength(0);
    expect(connectCalls[0]?.[0]).toMatchObject({
      state: {
        type: "codesandbox",
        providerSandboxId: "csb-1",
      },
    });
    expect(result.selectionReason).toBe("restore");
    expect(result.didSetupWorkspace).toBe(false);
  });

  test("rebuilds a missing pinned Vercel sandbox from source as a fresh workspace", async () => {
    sessionState = {
      type: "vercel",
      providerSandboxId: "session_session-1",
      sandboxName: "session_session-1",
      restore: {
        kind: "named",
        sandboxName: "session_session-1",
      },
    };
    connectError = Object.assign(new Error("Status code 404 is not ok"), {
      errorClass: "resource_not_found",
    });
    provisionProvider = "vercel";
    provisionReason = "primary";
    globalSkillRefs = [{ source: "vercel/ai", skillName: "ai-sdk" }];

    const { provisionSessionSandbox } = await provisioningModulePromise;
    const result = await provisionSessionSandbox({ sessionId: "session-1" });

    expect(connectCalls[0]?.[0]).toMatchObject({
      options: { createIfMissing: false },
    });
    expect(provisionCalls[0]?.[0]).toEqual({
      source: {
        repo: "https://github.com/acme/repo.git",
        branch: "main",
      },
      persistenceKey: "session_session-1",
    });
    expect(provisionCalls[0]?.[1]).toMatchObject({
      providerOrder: ["vercel"],
    });
    expect(installCalls).toHaveLength(1);
    expect(result).toMatchObject({
      provider: "vercel",
      selectionReason: "primary",
      didSetupWorkspace: true,
    });
  });

  test("stops the selected provider if archiving wins the persistence race", async () => {
    updateResult = null;
    const { provisionSessionSandbox, SessionArchivedDuringProvisioningError } =
      await provisioningModulePromise;
    await expect(
      provisionSessionSandbox({ sessionId: "session-1" }),
    ).rejects.toBeInstanceOf(SessionArchivedDuringProvisioningError);
    expect(stopCalls).toBe(1);
    expect(revokeCalls).toEqual(["scoped-token"]);
  });
});
