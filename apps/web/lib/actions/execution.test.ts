import { describe, expect, mock, test } from "bun:test";
import {
  executeActionOnce,
  type ActionExecution,
  type ActionExecutionStore,
} from "./execution";

function memoryStore(): ActionExecutionStore {
  const rows = new Map<string, ActionExecution>();
  const key = (value: { userId: string; chatId: string; toolCallId: string }) =>
    JSON.stringify([value.userId, value.chatId, value.toolCallId]);
  return {
    async claim(execution) {
      if (rows.has(key(execution))) return false;
      rows.set(key(execution), structuredClone(execution));
      return true;
    },
    async get(id) {
      return rows.get(key(id));
    },
    async complete(id, output) {
      const row = rows.get(key(id));
      if (!row) throw new Error("Missing execution");
      rows.set(key(id), { ...row, status: "completed", output });
    },
  };
}

const execution = {
  userId: "user-1",
  chatId: "chat-1",
  toolCallId: "send-1",
  toolName: "GMAIL_SEND_EMAIL",
  input: { body: "Hello" },
};

describe("durable external mutations", () => {
  test("reuses a completed send result without sending again", async () => {
    const store = memoryStore();
    const send = mock(async () => ({ messageId: "sent-1" }));
    await executeActionOnce(store, execution, send);
    expect(await executeActionOnce(store, execution, send)).toEqual({
      messageId: "sent-1",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("does not retry a timed out send or leak the provider error", async () => {
    const store = memoryStore();
    const send = mock(async () => {
      throw new Error("secret provider token");
    });
    await expect(executeActionOnce(store, execution, send)).rejects.toThrow(
      "could not be confirmed",
    );
    await expect(executeActionOnce(store, execution, send)).rejects.toThrow(
      "may already have run",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("rejects changed payloads on replay", async () => {
    const store = memoryStore();
    const send = mock(async () => ({ messageId: "sent-1" }));
    await executeActionOnce(store, execution, send);
    await expect(
      executeActionOnce(
        store,
        { ...execution, input: { body: "Changed" } },
        send,
      ),
    ).rejects.toThrow("does not match");
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("a concurrent attempt cannot dispatch the same mutation", async () => {
    const store = memoryStore();
    let finish: (value: unknown) => void = () => {};
    const output = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    const send = mock(() => output);
    const first = executeActionOnce(store, execution, send);
    await expect(executeActionOnce(store, execution, send)).rejects.toThrow(
      "may already have run",
    );
    finish({ messageId: "sent-1" });
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });
  test("execution keys are scoped to user and chat", async () => {
    const store = memoryStore();
    const send = mock(async () => ({ messageId: "sent-1" }));
    await executeActionOnce(store, execution, send);
    await executeActionOnce(
      store,
      { ...execution, userId: "user-2", chatId: "chat-2" },
      send,
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
});
