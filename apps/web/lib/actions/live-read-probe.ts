import { asSchema, type ToolSet } from "ai";
import { ACTION_REGISTRY, type ActionId, type ActionToolkit } from "./registry";
import { connectedAccountIdSchema, validateActionAccounts } from "./bindings";
import type { ActionProvider } from "./provider";
import type { ActionExecutionScope } from "./scope";

const READ_PROBES = {
  gmail: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"],
  linear: ["LINEAR_SEARCH_ISSUES", "LINEAR_GET_LINEAR_ISSUE"],
} as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function executeRead(
  tools: ToolSet,
  name: ActionId,
  input: Record<string, unknown>,
) {
  if (ACTION_REGISTRY[name].behavior !== "read")
    throw new Error("Probe denied a non-read action");
  const definition = tools[name];
  if (!definition?.execute) throw new Error("Read tool unavailable");
  const schema = asSchema(definition.inputSchema);
  if (!schema.validate)
    throw new Error("Exact schema validator is unavailable");
  const parsed = await schema.validate(input);
  if (!parsed.success)
    throw new Error("Read input does not match the exact provider schema");
  const result = object(
    await definition.execute(parsed.value, {
      toolCallId: crypto.randomUUID(),
      messages: [],
      abortSignal: AbortSignal.timeout(30_000),
    }),
  );
  if (!result || result.successful !== true || result.error)
    throw new Error("Read execution was not confirmed successful");
  // No bodies, titles, descriptions, addresses, tokens, or provider errors leave this function.
  return {
    action: name,
    successful: true,
    outputFieldCount: Object.keys(object(result.data) ?? {}).length,
  };
}

export async function runLiveReadProbe(params: {
  provider: ActionProvider;
  userId: string;
  toolkit: ActionToolkit;
  accountId: string;
  query: string;
  detailId?: string;
}) {
  const { provider, userId, toolkit } = params;
  const accountId = connectedAccountIdSchema.parse(params.accountId);
  if (!params.query.trim() || params.query.length > 200)
    throw new Error("A bounded search query is required");
  const names = READ_PROBES[toolkit];
  const scope: ActionExecutionScope = {
    tools: [...names],
    connectedAccounts: { [toolkit]: accountId },
  };
  await validateActionAccounts(provider, userId, scope);
  const sessionId = await provider.createSession(userId, scope);
  try {
    const tools = await provider.getTools({ userId, sessionId, scope });
    const listSchema = await asSchema(tools[names[0]]?.inputSchema).jsonSchema;
    const properties = listSchema.properties ?? {};
    const limitField = (
      toolkit === "gmail" ? ["max_results"] : ["first", "limit", "page_size"]
    ).find((name) => Object.hasOwn(properties, name));
    const queryField = ["query", "search_query"].find((name) =>
      Object.hasOwn(properties, name),
    );
    if (!limitField || !queryField)
      throw new Error(
        "Provider schema has no recognized bounded search parameters",
      );
    const input: Record<string, unknown> = {
      [limitField]: 1,
      [queryField]: params.query,
    };
    for (const name of ["include_payload", "verbose"])
      if (Object.hasOwn(properties, name)) input[name] = false;
    if (Object.hasOwn(properties, "only_ids")) input.only_ids = true;
    await validateActionAccounts(provider, userId, scope);
    const evidence = [await executeRead(tools, names[0], input)];
    if (params.detailId) {
      const properties =
        (await asSchema(tools[names[1]]?.inputSchema).jsonSchema).properties ??
        {};
      const idField = (
        toolkit === "gmail" ? ["message_id", "id"] : ["issue_id", "id"]
      ).find((name) => Object.hasOwn(properties, name));
      if (!idField)
        throw new Error("Provider schema has no recognized detail identifier");
      await validateActionAccounts(provider, userId, scope);
      evidence.push(
        await executeRead(tools, names[1], { [idField]: params.detailId }),
      );
    }
    return {
      status: params.detailId ? "PASS" : "PASS_LIST_ONLY",
      toolkit,
      evidence,
    };
  } finally {
    await provider.deleteSession(sessionId);
  }
}
