import { describe, expect, mock, test } from "bun:test";

mock.module("ai", () => ({
  isToolUIPart: (part: { type?: unknown }) =>
    typeof part.type === "string" && part.type.startsWith("tool-"),
}));

const {
  classifyBrowserCommand,
  classifyVerificationCommand,
  deriveMissionEvidence,
  derivePreviewEvidence,
} = await import("./mission-evidence");

type EvidenceMessage = Parameters<typeof deriveMissionEvidence>[0][number];

function userMessage(id: string, text: string): EvidenceMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantMessage(id: string, parts: unknown[]): EvidenceMessage {
  return { id, role: "assistant", parts } as EvidenceMessage;
}

function bashPart(
  command: string,
  result?: {
    state?: "output-available" | "output-error";
    success?: boolean;
    exitCode?: number | null;
  },
) {
  if (result?.state === "output-error") {
    return {
      type: "tool-bash",
      toolCallId: `bash-${command}`,
      state: "output-error",
      input: { command },
      errorText: "Command failed",
    };
  }

  return {
    type: "tool-bash",
    toolCallId: `bash-${command}`,
    state: "output-available",
    input: { command },
    output: {
      success: result?.success ?? true,
      exitCode: result?.exitCode ?? 0,
      stdout: "",
      stderr: "",
    },
  };
}

function preliminaryBashPart(command: string) {
  return {
    ...bashPart(command),
    preliminary: true,
  };
}

describe("verification command classification", () => {
  test.each([
    ["pnpm typecheck", "typecheck"],
    ["pnpm run typecheck", "typecheck"],
    ["pnpm --dir apps/web typecheck", "typecheck"],
    ["npm run typecheck", "typecheck"],
    ["yarn typecheck", "typecheck"],
    ["bun run typecheck", "typecheck"],
    ["turbo typecheck", "typecheck"],
    ["turbo run typecheck --filter=web", "typecheck"],
    ["tsc --noEmit", "typecheck"],
    ["pnpm exec tsc --noEmit", "typecheck"],
    ["pnpm test", "tests"],
    ["pnpm run test:unit", "tests"],
    ["npm test", "tests"],
    ["yarn test", "tests"],
    ["bun test", "tests"],
    ["vitest run", "tests"],
    ["npx jest", "tests"],
    ["pnpm build", "build"],
    ["npm run build", "build"],
    ["bun run build", "build"],
    ["turbo build", "build"],
    ["next build", "build"],
    ["pnpm lint", "lint"],
    ["pnpm check", "lint"],
    ["npm run lint", "lint"],
    ["yarn run check", "lint"],
    ["eslint .", "lint"],
    ["biome check .", "lint"],
    ["ultracite check", "lint"],
  ] as const)("classifies %s as %s", (command, category) => {
    expect(classifyVerificationCommand(command)).toBe(category);
  });

  test.each([
    "echo test",
    'echo "pnpm test"',
    "grep build README.md",
    "cat tests/results.txt",
    "pnpm run contest",
    "pnpm run rebuild",
    "node test-fixture.ts",
    "pnpm test && pnpm build",
  ])("ignores unrelated or ambiguous command %s", (command) => {
    expect(classifyVerificationCommand(command)).toBeNull();
  });
});

describe("Mission check evidence", () => {
  test("uses terminal Bash success and failure state", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Fix it"),
      assistantMessage("assistant-1", [
        bashPart("pnpm typecheck"),
        bashPart("pnpm test", { success: false, exitCode: 1 }),
        bashPart("pnpm build", {
          state: "output-error",
          success: false,
        }),
        bashPart("pnpm lint", { success: false, exitCode: 0 }),
      ]),
    ]);

    expect(evidence?.checks).toMatchObject([
      { category: "typecheck", status: "passed", exitCode: 0 },
      { category: "lint", status: "failed", exitCode: 0 },
      { category: "tests", status: "failed", exitCode: 1 },
      { category: "build", status: "failed" },
    ]);
  });

  test("uses the latest category result while retaining retry attempts", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Fix the build"),
      assistantMessage("assistant-1", [
        bashPart("pnpm build", { success: false, exitCode: 1 }),
        bashPart("pnpm build", { success: true, exitCode: 0 }),
      ]),
    ]);

    expect(evidence?.checks).toHaveLength(1);
    expect(evidence?.checks[0]).toMatchObject({
      category: "build",
      status: "passed",
      exitCode: 0,
    });
    expect(
      evidence?.checks[0]?.attempts.map((attempt) => attempt.status),
    ).toEqual(["failed", "passed"]);
  });

  test("excludes old tasks and includes assistant tool-result continuations", () => {
    const evidence = deriveMissionEvidence([
      userMessage("old-user", "Old task"),
      assistantMessage("old-assistant", [bashPart("pnpm test")]),
      userMessage("current-user", "Current task"),
      assistantMessage("current-assistant", [bashPart("pnpm typecheck")]),
      assistantMessage("tool-continuation", [bashPart("pnpm build")]),
    ]);

    expect(evidence?.anchorAssistantMessageId).toBe("tool-continuation");
    expect(evidence?.checks.map((check) => check.category)).toEqual([
      "typecheck",
      "build",
    ]);
  });

  test("does not treat assistant prose as verification evidence", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Ship it"),
      assistantMessage("assistant-1", [
        {
          type: "text",
          text: "I ran pnpm typecheck, tests, and the production build successfully.",
        },
      ]),
    ]);

    expect(evidence?.checks).toEqual([]);
    expect(evidence?.browser).toBeUndefined();
  });

  test("does not treat preliminary Bash output as a terminal result", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Run tests"),
      assistantMessage("assistant-1", [preliminaryBashPart("pnpm test")]),
    ]);

    expect(evidence?.checks).toEqual([]);
  });
});

describe("browser evidence", () => {
  test.each([
    ["agent-browser open http://localhost:3000/dashboard", "navigation"],
    ["agent-browser snapshot", "snapshot"],
    ["agent-browser console", "console"],
    ["agent-browser click @e4", "interaction"],
    ["agent-browser fill @e5 drew@example.com", "interaction"],
    ["agent-browser set viewport 390 844", "viewport"],
    ["agent-browser set device 'iPhone 14'", "viewport"],
    ["agent-browser --session qa snapshot -i", "snapshot"],
    ["agent-browser find role button click --name Submit", "interaction"],
    ["agent-browser screenshot evidence.png", "screenshot"],
  ] as const)("classifies %s as %s", (command, operation) => {
    expect(classifyBrowserCommand(command)?.operation).toBe(operation);
  });

  test("requires navigation plus a meaningful observation for Browser exercised", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Check the UI"),
      assistantMessage("assistant-1", [
        bashPart("agent-browser open http://localhost:3000/dashboard"),
        bashPart("agent-browser set viewport 390 844"),
        bashPart("agent-browser snapshot"),
        bashPart("agent-browser console"),
      ]),
    ]);

    expect(evidence?.browser).toMatchObject({
      status: "observed",
      exercised: true,
    });
    expect(
      evidence?.browser?.currentEvents.map((event) => event.operation),
    ).toEqual(["navigation", "viewport", "snapshot", "console"]);
  });

  test("does not overstate a snapshot without current-turn navigation", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Inspect the page"),
      assistantMessage("assistant-1", [bashPart("agent-browser snapshot")]),
    ]);

    expect(evidence?.browser).toMatchObject({
      status: "observed",
      exercised: false,
    });
  });

  test("keeps a failed browser command visible and ignores unrelated Bash", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Check the UI"),
      assistantMessage("assistant-1", [
        bashPart("agent-browser open http://localhost:3000"),
        bashPart("agent-browser click @missing", {
          success: false,
          exitCode: 1,
        }),
        bashPart('echo "browser snapshot complete"'),
      ]),
    ]);

    expect(evidence?.browser).toMatchObject({
      status: "failed",
      exercised: false,
    });
    expect(evidence?.browser?.events).toHaveLength(2);
  });
});

describe("delivery evidence", () => {
  test("reuses structured commit and PR parts", () => {
    const evidence = deriveMissionEvidence([
      userMessage("user-1", "Ship it"),
      assistantMessage("assistant-1", [
        {
          type: "data-commit",
          data: {
            status: "success",
            committed: true,
            pushed: true,
            url: "https://github.com/acme/app/commit/abc",
          },
        },
        {
          type: "data-pr",
          data: {
            status: "success",
            created: true,
            prNumber: 42,
            url: "https://github.com/acme/app/pull/42",
          },
        },
      ]),
    ]);

    expect(evidence?.delivery).toEqual({
      commit: {
        status: "observed",
        label: "Committed & pushed",
        committed: true,
        pushed: true,
        url: "https://github.com/acme/app/commit/abc",
      },
      pullRequest: {
        status: "observed",
        label: "PR #42 opened",
        number: 42,
        url: "https://github.com/acme/app/pull/42",
      },
    });
  });

  test("maps only already-known linked preview state", () => {
    expect(
      derivePreviewEvidence({
        hasLinkedProject: true,
        hasCurrentDelivery: true,
        deploymentUrl: "https://preview.example.com",
        buildingDeploymentUrl: null,
        failedDeploymentUrl: null,
        isDeploymentStale: false,
      }),
    ).toEqual({
      status: "ready",
      label: "Preview ready",
      url: "https://preview.example.com",
    });

    expect(
      derivePreviewEvidence({
        hasLinkedProject: true,
        hasCurrentDelivery: true,
        deploymentUrl: null,
        buildingDeploymentUrl: "https://vercel.com/building",
        failedDeploymentUrl: null,
        isDeploymentStale: true,
      }),
    ).toMatchObject({ status: "building", label: "Preview building" });

    expect(
      derivePreviewEvidence({
        hasLinkedProject: true,
        hasCurrentDelivery: true,
        deploymentUrl: null,
        buildingDeploymentUrl: null,
        failedDeploymentUrl: "https://vercel.com/failed",
        isDeploymentStale: false,
      }),
    ).toMatchObject({ status: "failed", label: "Preview failed" });

    expect(
      derivePreviewEvidence({
        hasLinkedProject: false,
        hasCurrentDelivery: true,
        deploymentUrl: "https://preview.example.com",
        buildingDeploymentUrl: null,
        failedDeploymentUrl: null,
        isDeploymentStale: false,
      }),
    ).toBeUndefined();
  });
});
