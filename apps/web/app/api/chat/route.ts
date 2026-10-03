import {
  createUIMessageStreamResponse,
  generateId,
  type InferUIMessageChunk,
} from "ai";
import { checkBotProtection } from "@/lib/botid";
import { start } from "workflow/api";
import type { WebAgentUIMessage } from "@/app/types";
import {
  claimChatActiveStreamId,
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  getChatById,
  getChatMessageByIdForChat,
  isFirstChatMessage,
  touchChat,
  updateChat,
} from "@/lib/db/sessions";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  resolveModelCredential,
  toInferenceAccessErrorResponse,
} from "@/lib/access/model-credential-resolver";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "./_lib/chat-context";
import { parseChatRequestBody, requireChatIdentifiers } from "./_lib/request";
import { runAgentWorkflow } from "@/app/workflows/chat";
import { validateGmailApprovalMessages } from "@/lib/actions/approval";
import { persistAssistantMessagesWithToolResults } from "./_lib/persist-tool-results";

import { getCodexConnection } from "@/lib/codex/credentials";

type WebAgentUIMessageChunk = InferUIMessageChunk<WebAgentUIMessage>;

export async function POST(req: Request) {
  // 1. Validate session
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }
  const userId = authResult.userId;
  const session = await getServerSession();

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const parsedBody = await parseChatRequestBody(req);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const { messages } = parsedBody.body;

  // 2. Require sessionId and chatId to ensure sandbox ownership verification
  const chatIdentifiers = requireChatIdentifiers(parsedBody.body);
  if (!chatIdentifiers.ok) {
    return chatIdentifiers.response;
  }
  const { sessionId, chatId } = chatIdentifiers;

  // 3. Verify session + chat ownership
  const chatContext = await requireOwnedSessionChat({
    userId,
    sessionId,
    chatId,
    forbiddenMessage: "Unauthorized",
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { sessionRecord, chat } = chatContext;

  if (sessionRecord.status === "archived") {
    return Response.json({ error: "Session is archived" }, { status: 400 });
  }

  const usesCodex = chat.executionBackend === "codex";
  if (chat.executionBackend === "opencode")
    return Response.json(
      { error: "OpenCode execution is not available." },
      { status: 400 },
    );
  if (usesCodex && !(await getCodexConnection(userId)).connected)
    return Response.json(
      {
        error: { code: "inference_source_required", remediation: ["add_byok"] },
      },
      { status: 403 },
    );
  if (
    usesCodex &&
    messages.some((message) =>
      message.parts.some((part) => part.type === "file"),
    )
  )
    return Response.json(
      {
        error:
          "Codex chats currently support text and workspace snippets. Add files to the workspace before asking Codex to inspect them.",
      },
      { status: 400 },
    );
  const admission = usesCodex
    ? { allowed: true as const }
    : await resolveModelCredential({
        userId,
        modelId: chat.modelId ?? APP_DEFAULT_MODEL_ID,
      });
  if (!admission.allowed) {
    return toInferenceAccessErrorResponse(admission.failure);
  }

  // Guard: if a workflow is already running for this chat, reconnect to it
  // instead of starting a duplicate. This prevents auto-submit from spawning
  // parallel workflows when the client sees completed tool calls mid-loop.
  if (chat.activeStreamId) {
    const existingStreamResolution = await reconcileExistingActiveStream(
      chatId,
      chat.activeStreamId,
    );

    if (existingStreamResolution.action === "resume") {
      return createUIMessageStreamResponse({
        stream: existingStreamResolution.stream,
        headers: { "x-workflow-run-id": existingStreamResolution.runId },
      });
    }

    if (existingStreamResolution.action === "conflict") {
      return Response.json(
        { error: "Another workflow is already running for this chat" },
        { status: 409 },
      );
    }
  }

  const validActionApprovals = await validateGmailApprovalMessages(
    messages,
    async (id) => {
      const saved = await getChatMessageByIdForChat(id, chatId);
      return saved?.parts;
    },
  );
  if (!validActionApprovals) {
    return Response.json(
      { error: "Invalid Gmail approval response" },
      { status: 403 },
    );
  }

  await Promise.all([
    persistLatestUserMessage(chatId, messages),
    persistAssistantMessagesWithToolResults(chatId, messages),
  ]);

  // Start the durable workflow
  const runCodexWorkflow = usesCodex
    ? (await import("@/app/workflows/codex")).runCodexWorkflow
    : null;
  const workflowOptions = {
    messages,
    chatId,
    sessionId,
    userId,
    requestUrl: req.url,
    authSession: session ?? null,
    assistantId: generateId(),
    maxSteps: 500,
  };
  const run = runCodexWorkflow
    ? await start(runCodexWorkflow, [workflowOptions])
    : await start(runAgentWorkflow, [workflowOptions]);

  // Idempotently claim the activeStreamId slot for the workflow we just
  // started. This succeeds both when the slot is still null and when the
  // workflow already self-claimed it from inside its first step.
  const claimed = await claimChatActiveStreamId(chatId, run.runId);

  if (!claimed) {
    // Another request or workflow run owns the slot — cancel our duplicate.
    try {
      const { getRun } = await import("workflow/api");
      getRun(run.runId).cancel();
    } catch {
      // Best-effort cleanup.
    }
    return Response.json(
      { error: "Another workflow is already running for this chat" },
      { status: 409 },
    );
  }

  const stream = createCancelableReadableStream(
    run.getReadable<WebAgentUIMessageChunk>(),
  );

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "x-workflow-run-id": run.runId,
    },
  });
}

type ExistingActiveStreamResolution =
  | {
      action: "resume";
      runId: string;
      stream: ReadableStream<WebAgentUIMessageChunk>;
    }
  | {
      action: "ready";
    }
  | {
      action: "conflict";
    };

const ACTIVE_STREAM_RECONCILIATION_MAX_ATTEMPTS = 3;

async function reconcileExistingActiveStream(
  chatId: string,
  activeStreamId: string,
): Promise<ExistingActiveStreamResolution> {
  const { getRun } = await import("workflow/api");
  let currentStreamId: string | null = activeStreamId;

  for (
    let attempt = 1;
    currentStreamId && attempt <= ACTIVE_STREAM_RECONCILIATION_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const existingRun = getRun(currentStreamId);
      const status = await existingRun.status;
      if (status === "running" || status === "pending") {
        return {
          action: "resume",
          runId: currentStreamId,
          stream: createCancelableReadableStream(
            existingRun.getReadable<WebAgentUIMessageChunk>(),
          ),
        };
      }
    } catch {
      // Workflow not found or inaccessible — try to clear the stale stream ID.
    }

    const cleared = await compareAndSetChatActiveStreamId(
      chatId,
      currentStreamId,
      null,
    );
    if (cleared) {
      return { action: "ready" };
    }

    const latestChat = await getChatById(chatId);
    currentStreamId = latestChat?.activeStreamId ?? null;
  }

  return currentStreamId ? { action: "conflict" } : { action: "ready" };
}

async function persistLatestUserMessage(
  chatId: string,
  messages: WebAgentUIMessage[],
): Promise<void> {
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage || latestMessage.role !== "user") {
    return;
  }

  try {
    const created = await createChatMessageIfNotExists({
      id: latestMessage.id,
      chatId,
      role: "user",
      parts: latestMessage,
    });

    if (!created) {
      return;
    }

    await touchChat(chatId);

    const shouldSetTitle = await isFirstChatMessage(chatId, created.id);
    if (!shouldSetTitle) {
      return;
    }

    const textContent = latestMessage.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (textContent.length === 0) {
      return;
    }

    const title =
      textContent.length > 80 ? `${textContent.slice(0, 80)}...` : textContent;
    await updateChat(chatId, { title });
  } catch (error) {
    console.error("Failed to persist user message:", error);
  }
}
