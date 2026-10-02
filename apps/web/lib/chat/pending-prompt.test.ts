import { describe, expect, test } from "bun:test";
import {
  clearPendingPrompt,
  loadPendingPrompt,
  pendingPromptStorageKey,
  savePendingPrompt,
} from "./pending-prompt";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("pending prompt persistence", () => {
  test("retains a blocked prompt locally until explicit clearing", () => {
    const storage = memoryStorage();
    savePendingPrompt(storage, "chat-1", "  Build the settings page  ");

    expect(loadPendingPrompt(storage, "chat-1")).toEqual({
      text: "Build the settings page",
    });
    expect(clearPendingPrompt(storage, "chat-1")).toBeUndefined();
    expect(loadPendingPrompt(storage, "chat-1")).toBeNull();
  });

  test("isolates prompts by scope and ignores malformed local data", () => {
    const storage = memoryStorage();
    storage.setItem(pendingPromptStorageKey("chat-1"), "plaintext legacy data");
    savePendingPrompt(storage, "chat-2", "Second prompt");

    expect(loadPendingPrompt(storage, "chat-1")).toBeNull();
    expect(loadPendingPrompt(storage, "chat-2")?.text).toBe("Second prompt");
  });

  test("does not persist an empty prompt", () => {
    const storage = memoryStorage();
    savePendingPrompt(storage, "chat-1", "   ");
    expect(loadPendingPrompt(storage, "chat-1")).toBeNull();
  });
});
