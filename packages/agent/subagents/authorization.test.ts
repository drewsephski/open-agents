import { describe, expect, mock, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";

const testSandbox = {
  workingDirectory: "/repo",
  exec: async () => ({
    success: true,
    exitCode: 0,
    stdout: "/repo/README.md\n",
    stderr: "",
    truncated: false,
  }),
  stat: async () => ({
    isDirectory: () => false,
    isFile: () => true,
    size: 7,
    mtimeMs: 0,
  }),
  readFile: async () => "welcome",
};

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async () => testSandbox,
}));

const { executorSubagent } = await import("./executor");

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

describe("subagent authorization", () => {
  test("re-authorizes every provider call and fails closed when access is revoked between steps", async () => {
    const firstAuthorizedModel = new MockLanguageModelV3({
      modelId: "test/subagent",
      doGenerate: {
        content: [
          {
            type: "tool-call",
            toolCallId: "read-1",
            toolName: "read",
            input: JSON.stringify({ filePath: "README.md" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
    });
    let resolutionCount = 0;

    const run = executorSubagent.generate({
      prompt: "Read the repository overview.",
      options: {
        task: "Inspect the repository",
        instructions: "Read README.md, then report what it says.",
        sandbox: {
          state: { type: "vercel", sandboxId: "sandbox-1" },
          workingDirectory: "/repo",
        },
        modelId: "test/subagent",
        resolveModel: async () => {
          resolutionCount += 1;
          if (resolutionCount === 1) {
            return firstAuthorizedModel;
          }
          throw new Error("Inference access revoked");
        },
      },
    });

    await expect(run).rejects.toThrow("Inference access revoked");
    expect(resolutionCount).toBe(2);
    expect(firstAuthorizedModel.doGenerateCalls).toHaveLength(1);
  });
});
