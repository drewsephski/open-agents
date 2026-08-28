import type { WebAgentUIMessage } from "@/app/types";

type StartInitialMessageInput = {
  sessionId: string;
  chatId: string;
  text: string;
};

export async function startInitialMessage({
  sessionId,
  chatId,
  text,
}: StartInitialMessageInput): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  const message: WebAgentUIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: trimmedText }],
  };
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, chatId, messages: [message] }),
  });

  if (!response.ok) {
    const responseBody = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(responseBody?.error ?? "Failed to send the first message");
  }
}
