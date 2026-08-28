import { afterEach, describe, expect, mock, test } from "bun:test";
import { startInitialMessage } from "./start-initial-message";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("startInitialMessage", () => {
  test("does not send a blank first message", async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await startInitialMessage({
      sessionId: "session-1",
      chatId: "chat-1",
      text: "   ",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("starts the chat with the trimmed first message", async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response()),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await startInitialMessage({
      sessionId: "session-1",
      chatId: "chat-1",
      text: "  Build the dashboard  ",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      sessionId: "session-1",
      chatId: "chat-1",
      messages: [
        {
          id: expect.any(String),
          role: "user",
          parts: [{ type: "text", text: "Build the dashboard" }],
        },
      ],
    });
  });

  test("surfaces chat start errors", async () => {
    globalThis.fetch = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        Response.json({ error: "Session is archived" }, { status: 400 }),
      ),
    ) as unknown as typeof fetch;

    await expect(
      startInitialMessage({
        sessionId: "session-1",
        chatId: "chat-1",
        text: "Hello",
      }),
    ).rejects.toThrow("Session is archived");
  });
});
