import "server-only";
import { type ToolSet } from "ai";
import { actionExecutionStore } from "@/lib/db/action-executions";
import { createComposioActionProvider } from "./composio";
import { executeActionOnce } from "./execution";
import { getChatById, getSessionById } from "@/lib/db/sessions";
import { readStackSnapshot } from "@/lib/stacks/schema";
import { ACTION_REGISTRY, requiresActionApproval } from "./registry";
import {
  ensureActionRuntimeSession,
  findLegacyActionScope,
  invalidateActionRuntimeSession,
} from "@/lib/db/action-runtime-sessions";
import type { ActionExecutionScope } from "./scope";
import { getStackActionIds, isStackActionAllowed } from "./stack-policy";
import { actionBindingsSchema, validateActionAccounts } from "./bindings";
import { normalizeActionScope } from "./scope";

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
  if (chat?.executionBackend !== "launchstack_native") return {};
  if (codingSession.status === "archived")
    throw new Error("Session is archived");
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
  let scope: ActionExecutionScope;
  if (codingSession.actionBindings != null) {
    const bindings = actionBindingsSchema.parse(codingSession.actionBindings);
    const connectedAccounts: ActionExecutionScope["connectedAccounts"] = {};
    for (const name of toolsAllowed) {
      const toolkit = ACTION_REGISTRY[name].toolkit;
      const binding = bindings[toolkit];
      if (!binding)
        throw new Error(
          `Missing frozen ${toolkit} account binding. Launch a new Session.`,
        );
      connectedAccounts[toolkit] = binding.accountId;
    }
    // Extra bindings, malformed identifiers, and broadened scopes fail closed.
    if (Object.keys(bindings).length !== Object.keys(connectedAccounts).length)
      throw new Error(
        "Frozen account bindings do not match Stack capabilities",
      );
    scope = normalizeActionScope({ tools: toolsAllowed, connectedAccounts });
  } else {
    const persisted = await findLegacyActionScope(context);
    if (!persisted) {
      if (!configuration) return {};
      throw new Error(
        "This legacy worker has no proven account binding. Launch a new Session to use its external Actions.",
      );
    }
    if (JSON.stringify(persisted.tools) !== JSON.stringify(toolsAllowed))
      throw new Error(
        "Legacy action scope does not match this worker. Launch a new Session.",
      );
    scope = persisted;
  }
  const frozenScope = scope;
  await validateActionAccounts(provider, context.userId, frozenScope);
  let session = await ensureActionRuntimeSession(context, provider, scope);
  let tools: ToolSet;
  try {
    tools = await provider.getTools(session);
  } catch (error) {
    // Only a confirmed missing runtime allows recreation. Never retry execution.
    if (!(error instanceof Error && "status" in error && error.status === 404))
      throw error;
    await validateActionAccounts(provider, context.userId, frozenScope);
    await invalidateActionRuntimeSession(context, session);
    session = await ensureActionRuntimeSession(context, provider, frozenScope);
    tools = await provider.getTools(session);
  }
  for (const [name, definition] of Object.entries(tools)) {
    if (!isStackActionAllowed(name, configuration?.actions)) {
      delete tools[name];
      continue;
    }
    const execute = definition.execute;
    if (!execute) throw new Error("Action has no executor");
    const dispatch: NonNullable<typeof execute> = async (input, options) => {
      if (!(await getChatById(context.chatId)))
        throw new Error("Chat no longer exists");
      const current = await getSessionById(chat.sessionId);
      if (
        !current ||
        current.userId !== context.userId ||
        current.status === "archived"
      )
        throw new Error("Worker is no longer active");
      await validateActionAccounts(provider, context.userId, frozenScope);
      return execute(input, options);
    };
    tools[name] = {
      ...definition,
      needsApproval: requiresActionApproval(name),
      execute: requiresActionApproval(name)
        ? async (input, options) => {
            await validateActionAccounts(provider, context.userId, frozenScope);
            return executeActionOnce(
              actionExecutionStore,
              {
                ...context,
                toolCallId: options.toolCallId,
                toolName: name,
                input,
              },
              async () => dispatch(input, options),
            );
          }
        : dispatch,
    };
  }
  return tools;
}
