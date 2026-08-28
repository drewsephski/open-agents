import { describe, expect, mock, test } from "bun:test";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ExecResult, Sandbox, SandboxStats } from "@open-agents/sandbox";

const execFileAsync = promisify(execFile);
const SMOKE_TOKEN = "SHIPCHECK_SMOKE_TOKEN";
const SMOKE_VALUE = "glm-5.3-flash-runtime-ok";
const MAX_AGENT_STEPS = 20;
const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());

const sandboxRegistry = new Map<string, Sandbox>();

mock.module("@open-agents/sandbox", () => ({
  connectSandbox: async (state: { sandboxId?: string }) => {
    if (!state.sandboxId) {
      throw new Error("Missing sandboxId in smoke-test sandbox state.");
    }
    const sandbox = sandboxRegistry.get(state.sandboxId);
    if (!sandbox) {
      throw new Error(`Unknown smoke-test sandbox: ${state.sandboxId}`);
    }
    return sandbox;
  },
}));

const { defaultLanguageModel, resolveDefaultModelId } =
  await import("./models");
const { openAgent } = await import("./open-agent");
const { explorerSubagent } = await import("./subagents/explorer");

interface LocalSandbox extends Sandbox {
  sandboxId: string;
}

async function createLocalSandbox(): Promise<{
  sandbox: LocalSandbox;
  workingDirectory: string;
}> {
  const workingDirectory = await mkdtemp(
    path.join(tmpdir(), "open-agents-smoke-"),
  );
  const sandboxId = `smoke-${path.basename(workingDirectory)}`;

  const sandbox: LocalSandbox = {
    sandboxId,
    type: "cloud",
    workingDirectory,
    async readFile(filePath: string, encoding: "utf-8") {
      return await readFile(filePath, { encoding });
    },
    async readFileBuffer(filePath: string) {
      return await readFile(filePath);
    },
    async writeFile(filePath: string, content: string, encoding: "utf-8") {
      await writeFile(filePath, content, { encoding });
    },
    async stat(filePath: string): Promise<SandboxStats> {
      return await stat(filePath);
    },
    async access(filePath: string) {
      await stat(filePath);
    },
    async mkdir(dirPath: string, options?: { recursive?: boolean }) {
      await mkdir(dirPath, options);
    },
    async readdir(dirPath: string, options: { withFileTypes: true }) {
      return await readdir(dirPath, options);
    },
    async exec(
      command: string,
      cwd: string,
      timeoutMs: number,
      options?: { signal?: AbortSignal },
    ): Promise<ExecResult> {
      try {
        const { stdout, stderr } = await execFileAsync(
          "bash",
          ["-c", command],
          {
            cwd,
            timeout: timeoutMs,
            signal: options?.signal,
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
          },
        );
        return {
          success: true,
          exitCode: 0,
          stdout,
          stderr,
          truncated: false,
        };
      } catch (error) {
        const failed = error as {
          code?: number | string;
          stdout?: string;
          stderr?: string;
          killed?: boolean;
        };
        const exitCode =
          typeof failed.code === "number"
            ? failed.code
            : failed.killed
              ? null
              : 1;
        return {
          success: false,
          exitCode,
          stdout: failed.stdout ?? "",
          stderr:
            failed.stderr ??
            (error instanceof Error ? error.message : String(error)),
          truncated: false,
        };
      }
    },
    async stop() {
      sandboxRegistry.delete(sandboxId);
    },
  };

  sandboxRegistry.set(sandboxId, sandbox);
  return { sandbox, workingDirectory };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getToolName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (typeof value.toolName === "string") {
    return value.toolName;
  }
  if (typeof value.name === "string") {
    return value.name;
  }
  return undefined;
}

function collectToolCalls(result: unknown): {
  names: string[];
  successful: boolean;
} {
  const names: string[] = [];
  let sawToolResult = false;
  let allSuccessful = true;

  if (!isRecord(result) || !Array.isArray(result.steps)) {
    return { names, successful: false };
  }

  for (const step of result.steps) {
    if (!isRecord(step)) {
      continue;
    }

    const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
    for (const toolCall of toolCalls) {
      const name = getToolName(toolCall);
      if (name) {
        names.push(name);
      }
    }

    const toolResults = Array.isArray(step.toolResults) ? step.toolResults : [];
    for (const toolResult of toolResults) {
      sawToolResult = true;
      if (!isRecord(toolResult)) {
        allSuccessful = false;
        continue;
      }
      const output = toolResult.output ?? toolResult.result;
      if (isRecord(output) && output.success === false) {
        allSuccessful = false;
      }
    }
  }

  return { names, successful: sawToolResult && allSuccessful };
}

function getGeneratedMessages(result: unknown): unknown[] {
  if (!isRecord(result)) {
    return [];
  }

  const response = isRecord(result.response) ? result.response : undefined;
  const fromResponse = Array.isArray(response?.messages)
    ? response.messages
    : [];
  if (fromResponse.length > 0) {
    return fromResponse;
  }

  return Array.isArray(result.messages) ? result.messages : [];
}

function getMessageRole(message: unknown): string {
  return isRecord(message) && typeof message.role === "string"
    ? message.role
    : "unknown";
}

async function runAgentUntilStop(prompt: string, sandbox: LocalSandbox) {
  let messages: unknown[] = [{ role: "user", content: prompt }];
  const toolNames: string[] = [];
  const transcript: string[] = [];
  let toolSucceeded = false;
  let finishReason = "unknown";
  let text = "";
  let modelId = resolveDefaultModelId();

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const result = await openAgent.generate({
      messages: messages as never,
      options: {
        sandbox: {
          state: { type: "vercel", sandboxId: sandbox.sandboxId },
          workingDirectory: sandbox.workingDirectory,
        },
        model: resolveDefaultModelId(),
        subagentModel: resolveDefaultModelId(),
      },
    });

    const toolSummary = collectToolCalls(result);
    toolNames.push(...toolSummary.names);
    toolSucceeded = toolSucceeded || toolSummary.successful;
    finishReason = String(result.finishReason ?? "unknown");
    if (typeof result.text === "string" && result.text.length > 0) {
      text = result.text;
    }
    modelId =
      typeof result.response === "object" &&
      result.response !== null &&
      "modelId" in result.response &&
      typeof result.response.modelId === "string"
        ? result.response.modelId
        : modelId;

    const generatedMessages = getGeneratedMessages(result);
    const alreadyHasUser = generatedMessages.some(
      (message) => getMessageRole(message) === "user",
    );
    transcript.push(
      [
        `step=${step + 1}`,
        `finish=${finishReason}`,
        `tools=${toolSummary.names.join(",") || "-"}`,
        `toolSuccess=${toolSummary.successful}`,
        `generated=${generatedMessages.map(getMessageRole).join("|") || "-"}`,
        `history=${messages.length}`,
        `textChars=${typeof result.text === "string" ? result.text.length : 0}`,
      ].join(" "),
    );

    if (generatedMessages.length > 0) {
      messages = alreadyHasUser
        ? generatedMessages
        : [...messages, ...generatedMessages];
    }

    if (finishReason !== "tool-calls") {
      break;
    }
  }

  return { toolNames, toolSucceeded, finishReason, text, modelId, transcript };
}

const describeSmoke = hasOpenRouterKey ? describe : describe.skip;

describeSmoke("GLM 5.3 Flash Open Agents runtime smoke", () => {
  test(
    "agent receives a task, executes a sandbox tool, and continues to a final response",
    async () => {
      const { sandbox, workingDirectory } = await createLocalSandbox();
      await mkdir(path.join(workingDirectory, "src"), { recursive: true });
      await writeFile(
        path.join(workingDirectory, "src", "smoke-marker.ts"),
        `export const marker = "${SMOKE_TOKEN}=${SMOKE_VALUE}";\n`,
        "utf8",
      );

      const main = await runAgentUntilStop(
        [
          "You are in a tiny fixture repository.",
          `Use grep on path "src" to find ${SMOKE_TOKEN}.`,
          "Then run bash command: echo SHIPCHECK_SMOKE_OK",
          "Then STOP. Do not call more tools.",
          `Final reply must include ${SMOKE_TOKEN}, ${SMOKE_VALUE}, and SHIPCHECK_SMOKE_OK.`,
          "Do not ask questions, edit files, or use the task tool.",
        ].join(" "),
        sandbox,
      );

      expect(resolveDefaultModelId()).toBe("z-ai/glm-5.3-flash");
      expect(main.toolNames.length, main.transcript.join("\n")).toBeGreaterThan(
        0,
      );
      expect(main.toolSucceeded, main.transcript.join("\n")).toBe(true);
      expect(main.finishReason, main.transcript.join("\n")).not.toBe(
        "tool-calls",
      );
      expect(main.text).toContain(SMOKE_TOKEN);
      expect(main.text).toMatch(/SHIPCHECK_SMOKE_OK|glm-5\.3-flash-runtime-ok/);
      expect(main.modelId).toContain("glm");

      const explorer = await explorerSubagent.generate({
        prompt:
          "Complete this task and provide a summary of what you accomplished.",
        options: {
          task: `Find ${SMOKE_TOKEN}`,
          instructions: [
            `Search the repository for ${SMOKE_TOKEN}.`,
            "Report the file path and the full token assignment.",
            "Do not modify files.",
          ].join(" "),
          sandbox: {
            state: { type: "vercel", sandboxId: sandbox.sandboxId },
            workingDirectory: sandbox.workingDirectory,
          },
          model: defaultLanguageModel(),
        },
      });

      expect(explorer.text).toContain(SMOKE_TOKEN);
      await sandbox.stop();
    },
    { timeout: 300_000 },
  );
});
