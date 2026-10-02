import "server-only";
import { type ToolSet } from "ai";
import { actionExecutionStore } from "@/lib/db/action-executions";
import { findActionSession } from "@/lib/db/action-sessions";
import { createComposioActionProvider } from "./composio";
import { executeActionOnce } from "./execution";

export function getActionProvider() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  return apiKey ? createComposioActionProvider(apiKey) : undefined;
}

export async function getUserActionTools(context: {
  userId: string;
  chatId: string;
}): Promise<ToolSet> {
  const provider = getActionProvider();
  if (!provider) return {};
  const session = await findActionSession(context.userId, provider.id);
  // Merely chatting never creates an external session or connects an account.
  if (!session || (await provider.getConnectionStatus(session)) !== "connected")
    return {};
  const tools = await provider.getTools(session);
  for (const [name, definition] of Object.entries(tools)) {
    if (definition.needsApproval !== true) continue;
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
