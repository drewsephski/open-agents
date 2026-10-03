import "server-only";
import { createHash } from "node:crypto";
import { connectSandbox, type SandboxState } from "@open-agents/sandbox";
import type { WebAgentUIMessage } from "@/app/types";
import { getResponseGuidance } from "@/lib/chat/response-guidance";
import { getChatById, getSessionById } from "@/lib/db/sessions";
import { getMissionInstructions } from "@/lib/mission-guidance.server";
import { normalizeMissionType } from "@/lib/missions";
import { loadCodexAuth, persistRefreshedCodexAuth } from "./credentials";
import { codexAuthFileSchema } from "./auth-file";
import { CODEX_RUNNER_SCRIPT } from "./runner-script";
import { z } from "zod";

import { CodexRuntimeError } from "./errors";

import { codexRunLeaseStore } from "./run-lease";

const CODEX_VERSION = "0.160.0";
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function codexRunDirectory(runId: string): string {
  return (
    "/tmp/launchstack-codex-" + createHash("sha256").update(runId).digest("hex")
  );
}

export function codexAuthDirectory(runId: string): string {
  return codexRunDirectory(runId).replace("/tmp/", "/dev/shm/");
}

export function buildCodexPrompt(
  messages: WebAgentUIMessage[],
  instructions = "",
): string {
  const transcript = messages
    .map((message) => {
      const text = message.parts
        .flatMap((part) => {
          if (part.type === "text") return [part.text];
          if (part.type === "data-snippet") return [JSON.stringify(part.data)];
          return [];
        })
        .join("\n");
      return `${message.role}: ${text}`;
    })
    .join("\n\n");
  if (transcript.length > 200000)
    throw new CodexRuntimeError(
      "This chat is too large for Codex. Start a new chat with a summary.",
    );
  return `${instructions}\n\n${getResponseGuidance(messages)}\n\nWork in the current workspace. Continue the conversation below and answer the final user request. Do not read credentials or files outside the workspace. Do not commit or push changes; the user reviews the workspace diff.\n\n${transcript}`;
}

export async function startCodexRun(params: {
  userId: string;
  sessionId: string;
  chatId: string;
  runId: string;
  sandboxState: SandboxState;
  messages: WebAgentUIMessage[];
}) {
  const [session, chat] = await Promise.all([
    getSessionById(params.sessionId),
    getChatById(params.chatId),
  ]);
  if (
    !session ||
    session.userId !== params.userId ||
    chat?.sessionId !== session.id ||
    chat.executionBackend !== "codex" ||
    chat.activeStreamId !== params.runId
  )
    throw new CodexRuntimeError("Codex run is no longer active.");
  const sandbox = await connectSandbox(params.sandboxState);
  if (sandbox.type !== "cloud")
    throw new CodexRuntimeError("Codex requires an isolated cloud workspace.");
  if (!sandbox.execDetached)
    throw new CodexRuntimeError(
      "This workspace cannot run Codex in the background.",
    );
  const dir = codexRunDirectory(params.runId);
  const authDir = codexAuthDirectory(params.runId);
  try {
    await sandbox.access(dir + ".stopped");
    throw new CodexRuntimeError("Codex run was stopped.");
  } catch (error) {
    if (error instanceof Error && error.message === "Codex run was stopped.")
      throw error;
  }
  if (!(await codexRunLeaseStore.acquire(params.userId, params.runId)))
    throw new CodexRuntimeError(
      "Another Codex task is running. Stop it or wait for it to finish, then retry.",
    );
  // A replay reuses this run, never dispatches the same prompt twice.
  try {
    await sandbox.access(dir + "/input.json");
    return;
  } catch {
    /* first dispatch */
  }
  const setup = await sandbox.exec(
    `umask 077; mkdir -p ${quote(dir + "/cli")}; pnpm --dir ${quote(dir + "/cli")} add @openai/codex@${CODEX_VERSION} --ignore-scripts`,
    sandbox.workingDirectory,
    120000,
  );
  if (!setup.success)
    throw new CodexRuntimeError(
      "Could not install Codex in this workspace. Try a new workspace.",
    );
  const currentChat = await getChatById(params.chatId);
  if (currentChat?.activeStreamId !== params.runId)
    throw new CodexRuntimeError("Codex run was stopped.");
  // VM checkpoints persist disk. Keep plaintext login on verified memory storage.
  const storage = await sandbox.exec(
    "stat -f -c %T /dev/shm",
    sandbox.workingDirectory,
    10000,
  );
  if (!storage.success || storage.stdout.trim() !== "tmpfs")
    throw new CodexRuntimeError(
      "This workspace cannot securely store a Codex login. Try a new workspace.",
    );
  const prepared = await sandbox.exec(
    `umask 077; mkdir -p ${quote(authDir)}; chmod 700 ${quote(authDir)}`,
    sandbox.workingDirectory,
    10000,
  );
  if (!prepared.success)
    throw new CodexRuntimeError("Could not secure the Codex connection.");
  const auth = await loadCodexAuth(params.userId);
  await sandbox.writeFile(authDir + "/auth.json", auth.authFile, "utf-8");
  await sandbox.writeFile(
    dir + "/credential-version",
    auth.ciphertext,
    "utf-8",
  );
  await sandbox.writeFile(dir + "/runner.cjs", CODEX_RUNNER_SCRIPT, "utf-8");
  await sandbox.writeFile(dir + "/heartbeat", "", "utf-8");
  await sandbox.writeFile(
    dir + "/input.json",
    JSON.stringify({
      cwd: sandbox.workingDirectory,
      authDirectory: authDir,
      prompt: buildCodexPrompt(
        params.messages,
        getMissionInstructions(normalizeMissionType(session.missionType)),
      ),
    }),
    "utf-8",
  );
  const secured = await sandbox.exec(
    `chmod -R go-rwx ${quote(dir)}`,
    sandbox.workingDirectory,
    10000,
  );
  if (!secured.success)
    throw new CodexRuntimeError("Could not secure the Codex connection.");
  try {
    await sandbox.execDetached(
      `node ${quote(dir + "/runner.cjs")}`,
      sandbox.workingDirectory,
    );
  } catch {
    await sandbox.exec(
      `rm -rf ${quote(dir)} ${quote(authDir)}`,
      sandbox.workingDirectory,
      10000,
    );
    throw new CodexRuntimeError("Could not start Codex. Try a new chat.");
  }
}

const resultSchema = z.object({
  exitCode: z.number().nullable(),
  output: z.string(),
  truncated: z.boolean(),
});
const eventSchema = z.object({
  type: z.string(),
  item: z.object({ type: z.string(), text: z.string().optional() }).optional(),
});

export function extractCodexAnswer(output: string): string {
  const answers: string[] = [];
  let completed = false;
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new CodexRuntimeError(
        "Codex returned an incomplete response. Try again.",
      );
    }
    const event = eventSchema.safeParse(value);
    if (!event.success) continue;
    if (event.data.type === "turn.failed" || event.data.type === "error")
      throw new CodexRuntimeError(
        "Codex could not finish. Check your Codex subscription limits or reconnect in Connections.",
      );
    if (event.data.type === "turn.completed") completed = true;
    if (
      event.data.type === "item.completed" &&
      event.data.item?.type === "agent_message" &&
      event.data.item.text
    )
      answers.push(event.data.item.text);
  }
  if (!completed || answers.length === 0)
    throw new CodexRuntimeError(
      "Codex did not return a completed answer. Try again.",
    );
  return answers.join("\n\n");
}

export async function pollCodexRun(params: {
  userId: string;
  sessionId: string;
  chatId: string;
  runId: string;
  sandboxState: SandboxState;
}): Promise<{ done: false } | { done: true; text: string }> {
  const chat = await getChatById(params.chatId);
  if (chat?.activeStreamId !== params.runId)
    throw new CodexRuntimeError("Codex run was stopped.");
  const sandbox = await connectSandbox(params.sandboxState);
  const dir = codexRunDirectory(params.runId);
  await sandbox.writeFile(dir + "/heartbeat", "", "utf-8");
  try {
    await sandbox.access(dir + "/result.json");
  } catch {
    return { done: false };
  }
  try {
    const result = resultSchema.parse(
      JSON.parse(await sandbox.readFile(dir + "/result.json", "utf-8")),
    );
    if (result.exitCode !== 0 || result.truncated)
      throw new CodexRuntimeError(
        "Codex could not finish. Reconnect in Connections or check your Codex usage limits, then try again.",
      );
    const authFile = await sandbox.readFile(
      codexAuthDirectory(params.runId) + "/auth.json",
      "utf-8",
    );
    const auth = codexAuthFileSchema.parse(JSON.parse(authFile));
    let text = extractCodexAnswer(result.output);
    for (const secret of Object.values(auth.tokens))
      text = text.replaceAll(secret, "[redacted]");
    const previous = await sandbox.readFile(
      dir + "/credential-version",
      "utf-8",
    );
    await persistRefreshedCodexAuth(params.userId, previous, authFile);
    return { done: true, text };
  } finally {
    await sandbox.exec(
      `rm -rf ${quote(dir)} ${quote(codexAuthDirectory(params.runId))}`,
      sandbox.workingDirectory,
      10000,
    );
  }
}

export async function stopCodexRun(
  sandboxState: SandboxState,
  runId: string,
  userId: string,
) {
  const sandbox = await connectSandbox(sandboxState);
  const dir = codexRunDirectory(runId);
  const script = `const fs=require('node:fs');const d=${JSON.stringify(dir)};fs.writeFileSync(d+'.stopped','');try{const pid=Number(fs.readFileSync(d+'/pid','utf8'));if(Number.isInteger(pid)&&pid>1)try{process.kill(-pid,'SIGKILL')}catch{}}catch{}fs.rmSync(d,{recursive:true,force:true});fs.rmSync(${JSON.stringify(codexAuthDirectory(runId))},{recursive:true,force:true});`;
  const stopped = await sandbox.exec(
    "node -e " + quote(script),
    sandbox.workingDirectory,
    10000,
  );
  if (!stopped.success)
    throw new CodexRuntimeError(
      "Could not stop Codex in the workspace. Try stopping the workspace.",
    );
  await codexRunLeaseStore.release(userId, runId);
}
