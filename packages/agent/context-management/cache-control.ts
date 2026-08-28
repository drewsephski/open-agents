import type { ModelMessage, JSONValue, LanguageModel, ToolSet } from "ai";

type ProviderOptions = Record<string, Record<string, JSONValue>>;

function isAnthropicModel(model: LanguageModel): boolean {
  if (typeof model === "string") {
    return model.includes("anthropic") || model.includes("claude");
  }
  return (
    model.provider === "anthropic" ||
    model.provider.includes("anthropic") ||
    model.modelId.includes("anthropic") ||
    model.modelId.includes("claude")
  );
}

/**
 * Anthropic cache-control markers for OpenRouter.
 *
 * `@openrouter/ai-sdk-provider@2.9.1` forwards Anthropic prompt caching when
 * `cacheControl: { type: "ephemeral" }` is set under the `openrouter`
 * provider namespace (and also converts Anthropic-specific options internally).
 * We set both namespaces so markers still apply when routing Anthropic models
 * through OpenRouter.
 *
 * GLM and other non-Anthropic defaults skip this path — cache markers are
 * Anthropic-only.
 */
const DEFAULT_CACHE_CONTROL_OPTIONS: Record<
  string,
  Record<string, JSONValue>
> = {
  anthropic: { cacheControl: { type: "ephemeral" } },
  openrouter: { cacheControl: { type: "ephemeral" } },
};

/**
 * Adds provider-specific cache control options to tools for optimal caching.
 *
 * For Anthropic (including Anthropic models routed through OpenRouter): marks
 * the last tool with `cacheControl: { type: "ephemeral" }`.
 * For non-Anthropic models, tools are returned unchanged.
 */
export function addCacheControl<T extends ToolSet>(options: {
  tools: T;
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}): T;

/**
 * Adds provider-specific cache control options to messages for optimal caching.
 *
 * For Anthropic: marks the last message with `cacheControl: { type: "ephemeral" }`
 * per their docs - "Mark the final block of the final message with cache_control
 * so the conversation can be incrementally cached."
 *
 * For non-Anthropic models, messages are returned unchanged.
 */
export function addCacheControl(options: {
  messages: ModelMessage[];
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}): ModelMessage[];

export function addCacheControl<T extends ToolSet>({
  tools,
  messages,
  model,
  providerOptions = DEFAULT_CACHE_CONTROL_OPTIONS,
}: {
  tools?: T;
  messages?: ModelMessage[];
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}): T | ModelMessage[] {
  if (!isAnthropicModel(model)) {
    return (tools ?? messages)!;
  }

  if (tools !== undefined) {
    const entries = Object.entries(tools);
    if (entries.length === 0) return tools;

    // Anthropic supports max 4 cache breakpoints - only mark the last tool
    // to avoid exceeding the limit when combined with message caching
    const lastIndex = entries.length - 1;
    return Object.fromEntries(
      entries.map(([name, tool], index) => [
        name,
        index === lastIndex
          ? {
              ...tool,
              providerOptions: {
                ...tool.providerOptions,
                ...providerOptions,
              },
            }
          : tool,
      ]),
    ) as T;
  }

  if (messages !== undefined) {
    if (messages.length === 0) return messages;
    return messages.map((message, index) =>
      index === messages.length - 1
        ? {
            ...message,
            providerOptions: {
              ...message.providerOptions,
              ...providerOptions,
            },
          }
        : message,
    );
  }

  throw new Error("Either tools or messages must be provided");
}
