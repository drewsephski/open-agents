import { isDeepStrictEqual } from "node:util";

export interface ActionExecutionKey {
  userId: string;
  chatId: string;
  toolCallId: string;
}

export interface ActionExecution extends ActionExecutionKey {
  toolName: string;
  input: unknown;
  status: "started" | "completed";
  output?: unknown;
}

export interface ActionExecutionStore {
  claim(execution: ActionExecution): Promise<boolean>;
  get(key: ActionExecutionKey): Promise<ActionExecution | undefined>;
  complete(key: ActionExecutionKey, output: unknown): Promise<void>;
}

/** At-most-once dispatch. An uncertain write must be checked in the connected app manually. */
export async function executeActionOnce(
  store: ActionExecutionStore,
  execution: Omit<ActionExecution, "status" | "output">,
  execute: () => PromiseLike<unknown>,
): Promise<unknown> {
  const claimed = await store.claim({ ...execution, status: "started" });
  if (!claimed) {
    const previous = await store.get(execution);
    if (
      !previous ||
      previous.toolName !== execution.toolName ||
      !isDeepStrictEqual(previous.input, execution.input)
    ) {
      throw new Error("Action replay does not match the original request");
    }
    if (previous.status === "completed") {
      return previous.output;
    }
    throw new Error(
      "This external action may already have run. Check the connected app before requesting a new action; it will not be retried automatically.",
    );
  }
  try {
    const output = await execute();
    await store.complete(execution, output);
    return output;
  } catch {
    // Keep the started claim even on timeout/crash; the remote outcome is unknown.
    throw new Error(
      "The external action could not be confirmed. Check the connected app before requesting a new action; it will not be retried automatically.",
    );
  }
}
