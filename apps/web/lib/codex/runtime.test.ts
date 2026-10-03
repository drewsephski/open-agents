import { beforeEach, describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const files = new Map<string, string>();
const commands: string[] = [];
let owner = "owner";
let activeRun: string | null = "run";
let starts = 0;
let refreshCalls = 0;
const authFile = JSON.stringify({
  tokens: {
    id_token: "identity-secret",
    access_token: "access-secret",
    refresh_token: "refresh-secret",
    account_id: "account-secret",
  },
});
mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => ({
    id: "session",
    userId: owner,
    missionType: "build",
  }),
  getChatById: async () => ({
    sessionId: "session",
    executionBackend: "codex",
    activeStreamId: activeRun,
  }),
}));
mock.module("@/lib/mission-guidance.server", () => ({
  getMissionInstructions: () => "Build carefully.",
}));
mock.module("./credentials", () => ({
  loadCodexAuth: async () => ({ authFile, ciphertext: "encrypted-version" }),
  persistRefreshedCodexAuth: async () => {
    refreshCalls++;
  },
}));
mock.module("./run-lease", () => ({
  codexRunLeaseStore: { acquire: async () => true, release: async () => {} },
}));
mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => ({
    workingDirectory: "/workspace",
    type: "cloud",
    access: async (path: string) => {
      if (!files.has(path)) throw new Error("missing");
    },
    mkdir: async () => {},
    writeFile: async (path: string, value: string) => {
      files.set(path, value);
    },
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("missing");
      return value;
    },
    exec: async (command: string) => {
      commands.push(command);
      return {
        success: true,
        stdout: command.startsWith("stat ") ? "tmpfs\n" : "",
      };
    },
    execDetached: async () => {
      starts++;
    },
  }),
}));
const {
  startCodexRun,
  pollCodexRun,
  buildCodexPrompt,
  extractCodexAnswer,
  codexRunDirectory,
  codexAuthDirectory,
} = await import("./runtime");
const options = {
  userId: "owner",
  sessionId: "session",
  chatId: "chat",
  runId: "run",
  sandboxState: { type: "vercel" as const },
  messages: [
    {
      id: "user",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "Build a page" }],
    },
  ],
};

describe("Codex sandbox runtime", () => {
  beforeEach(() => {
    files.clear();
    commands.length = 0;
    owner = "owner";
    activeRun = "run";
    starts = 0;
    refreshCalls = 0;
  });
  test("checks ownership and active stream before installing or loading auth", async () => {
    owner = "victim";
    await expect(startCodexRun(options)).rejects.toThrow("no longer active");
    expect(commands).toHaveLength(0);
    owner = "owner";
    activeRun = null;
    await expect(startCodexRun(options)).rejects.toThrow("no longer active");
  });
  test("dispatches once, keeps auth outside the repo, and never puts auth in shell commands", async () => {
    await startCodexRun(options);
    await startCodexRun(options);
    expect(starts).toBe(1);
    expect(files.get(codexAuthDirectory("run") + "/auth.json")).toBe(authFile);
    expect(commands.join("\n")).not.toContain("access-secret");
    expect(files.get(codexRunDirectory("run") + "/input.json")).not.toContain(
      "refresh-secret",
    );
  });
  test("requires a completed turn rather than treating partial provider output as success", () => {
    expect(() =>
      extractCodexAnswer(
        '{"type":"item.completed","item":{"type":"agent_message","text":"partial"}}',
      ),
    ).toThrow("completed answer");
    expect(() =>
      extractCodexAnswer(
        '{"type":"turn.failed","error":{"message":"private diagnostic"}}',
      ),
    ).toThrow("subscription limits");
  });
  test("saves refreshed auth, redacts credentials, and removes temporary files on completion", async () => {
    await startCodexRun(options);
    const dir = codexRunDirectory("run");
    files.set(
      dir + "/result.json",
      JSON.stringify({
        exitCode: 0,
        truncated: false,
        output:
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "Done access-secret" },
          }) +
          "\n" +
          JSON.stringify({ type: "turn.completed" }),
      }),
    );
    const result = await pollCodexRun(options);
    expect(result).toEqual({ done: true, text: "Done [redacted]" });
    expect(refreshCalls).toBe(1);
    expect(commands.at(-1)).toContain("rm -rf");
  });
  test("cleans credentials on failure without returning provider diagnostics", async () => {
    await startCodexRun(options);
    files.set(
      codexRunDirectory("run") + "/result.json",
      JSON.stringify({
        exitCode: 1,
        truncated: false,
        output: "private-secret-diagnostic",
      }),
    );
    await expect(pollCodexRun(options)).rejects.toThrow("Reconnect");
    expect(commands.at(-1)).toContain("rm -rf");
  });
  test("includes snippets and rejects oversized history without clipping the request", () => {
    expect(buildCodexPrompt(options.messages)).toContain("user: Build a page");
    expect(() =>
      buildCodexPrompt([
        {
          id: "x",
          role: "user",
          parts: [{ type: "text", text: "x".repeat(200001) }],
        },
      ]),
    ).toThrow("too large");
  });

  test("includes shared response guidance and the current pstack mode in Codex prompts", () => {
    const messages = [
      {
        id: "mode",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "/pstack" }],
      },
      ...options.messages,
    ];
    const prompt = buildCodexPrompt(messages, "Mission guidance");
    expect(prompt).toContain("Mission guidance");
    expect(prompt).toContain("# Response style");
    expect(prompt).toContain("# Engineering mode: pstack");
    expect(prompt).toContain("user: Build a page");
    expect(prompt).toContain("Do not commit or push changes");

    const disabled = buildCodexPrompt([
      ...messages,
      {
        id: "off",
        role: "user",
        parts: [{ type: "text", text: "/pstack-off" }],
      },
    ]);
    expect(disabled).toContain("# Engineering mode: standard");
    expect(disabled).not.toContain("# Engineering mode: pstack");
    expect(disabled).toContain("Briefly confirm that pstack mode is off");
  });
});
