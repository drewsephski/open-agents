interface PromptStorage {
  getItem(key: string): string | null;
  removeItem(key: string): unknown;
  setItem(key: string, value: string): unknown;
}

export interface PendingPrompt {
  text: string;
}

export function pendingPromptStorageKey(scope: string): string {
  return `launchstack:pending-prompt:${scope}`;
}

export function savePendingPrompt(
  storage: PromptStorage,
  scope: string,
  text: string,
): void {
  const trimmedText = text.trim();
  if (!trimmedText) return;
  storage.setItem(
    pendingPromptStorageKey(scope),
    JSON.stringify({ text: trimmedText }),
  );
}

export function loadPendingPrompt(
  storage: PromptStorage,
  scope: string,
): PendingPrompt | null {
  const stored = storage.getItem(pendingPromptStorageKey(scope));
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as { text?: unknown };
    if (typeof value.text !== "string" || !value.text.trim()) return null;
    return { text: value.text.trim() };
  } catch {
    return null;
  }
}

export function clearPendingPrompt(
  storage: PromptStorage,
  scope: string,
): void {
  storage.removeItem(pendingPromptStorageKey(scope));
}
