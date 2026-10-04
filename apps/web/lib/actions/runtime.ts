import "server-only";
import { type ToolSet } from "ai";
import { actionExecutionStore } from "@/lib/db/action-executions";
import { findActionSession } from "@/lib/db/action-sessions";
import { createComposioActionProvider } from "./composio";
import { executeActionOnce } from "./execution";
import { getChatById, getSessionById } from "@/lib/db/sessions";
import { readStackSnapshot } from "@/lib/stacks/schema";
import {
  ACTION_REGISTRY,
  ACTION_TOOLKITS,
  requiresActionApproval,
} from "./registry";
import { ensureActionRuntimeSession } from "@/lib/db/action-runtime-sessions";
import type { ActionExecutionScope } from "./scope";
import { getStackActionIds, isStackActionAllowed } from "./stack-policy";

export function getActionProvider() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  return apiKey ? createComposioActionProvider(apiKey) : undefined;
}

export async function getUserActionTools(context: {
  userId: string;
  chatId: string;
}): Promise<ToolSet> {
  const chat = await getChatById(context.chatId);
  const codingSession = chat ? await getSessionById(chat.sessionId) : undefined;
  if (!codingSession || codingSession.userId !== context.userId)
    throw new Error("Unauthorized action context");
  if (chat?.executionBackend === "codex") return {};
  const configuration = readStackSnapshot(
    codingSession.stackSnapshot,
  )?.configuration;
  if (
    configuration &&
    (configuration.executionBackend !== "launchstack_native" ||
      !configuration.actions.capabilities.length)
  )
    return {};
  const toolsAllowed = getStackActionIds(configuration?.actions);
  if (!toolsAllowed.length) return {};
  const provider = getActionProvider();
  if (!provider) {
    if (!configuration) return {};
    throw new Error(
      "External actions required by this Stack are not configured on this deployment.",
    );
  }
  const toolkits = [
    ...new Set(toolsAllowed.map((name) => ACTION_REGISTRY[name].toolkit)),
  ];
  const connectedAccounts: ActionExecutionScope["connectedAccounts"] = {};
  for (const toolkit of toolkits) {
    const connectionSession = await findActionSession(
      context.userId,
      provider.id,
      toolkit,
    );
    const connection = connectionSession
      ? await provider.getConnection(connectionSession, toolkit)
      : undefined;
    if (connection?.status !== "connected") {
      // Legacy sessions historically degrade to coding-only when Gmail is absent.
      if (!configuration) return {};
      throw new Error(
        `${ACTION_TOOLKITS[toolkit].label} is required by this Stack. Connect it in Settings → Connections before using this worker.`,
      );
    }
    connectedAccounts[toolkit] = connection.accountId;
  }
  const session = await ensureActionRuntimeSession(context, provider, {
    tools: toolsAllowed,
    connectedAccounts,
  });
  const tools = await provider.getTools(session);
  for (const [name, definition] of Object.entries(tools)) {
    if (!isStackActionAllowed(name, configuration?.actions)) {
      delete tools[name];
      continue;
    }
    if (!requiresActionApproval(name)) {
      tools[name] = { ...definition, needsApproval: false };
      continue;
    }
    const execute = definition.execute;
    if (!execute) throw new Error("Action has no executor");
    tools[name] = {
      ...definition,
      needsApproval: true,
      execute: (input, options) =>
        executeActionOnce(
          actionExecutionStore,
          {
            ...context,
            toolCallId: options.toolCallId,
            toolName: name,
            input,
          },
          async () => execute(input, options),
        ),
    };
  }
  return tools;
}
