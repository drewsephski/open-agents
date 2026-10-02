import { z } from "zod";
import {
  deleteOpenRouterCredential,
  getOpenRouterCredentialStatus,
  replaceOpenRouterCredential,
  type SafeProviderCredentialStatus,
} from "@/lib/credentials/provider-credentials";
import { OpenRouterValidationUnavailableError } from "@/lib/credentials/openrouter-validation";
import { getServerSession } from "@/lib/session/get-server-session";

const replaceCredentialSchema = z.object({
  apiKey: z.string().trim().min(8).max(512),
});

function safeCredentialResponse(status: SafeProviderCredentialStatus) {
  return {
    state: status.state,
    label: status.label,
    lastFour: status.lastFour,
    validatedAt: status.validatedAt,
  };
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("not_authenticated", "Not authenticated", 401);
  }

  try {
    const credential = await getOpenRouterCredentialStatus(userId);
    return Response.json({ credential: safeCredentialResponse(credential) });
  } catch {
    console.error("Provider credential status lookup failed");
    return errorResponse(
      "credential_status_unavailable",
      "Credential status is unavailable",
      500,
    );
  }
}

export async function PUT(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("not_authenticated", "Not authenticated", 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("invalid_payload", "Invalid credential payload", 400);
  }
  const parsedPayload = replaceCredentialSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return errorResponse("invalid_payload", "Invalid credential payload", 400);
  }

  try {
    const credential = await replaceOpenRouterCredential(
      userId,
      parsedPayload.data.apiKey,
    );
    const safeCredential = safeCredentialResponse(credential);
    if (credential.state === "invalid" || credential.state === "revoked") {
      return Response.json(
        {
          error: {
            code: "credential_rejected",
            message: "OpenRouter rejected this credential",
          },
          credential: safeCredential,
        },
        { status: 400 },
      );
    }

    return Response.json({ credential: safeCredential });
  } catch (error) {
    if (error instanceof OpenRouterValidationUnavailableError) {
      return errorResponse(
        "credential_validation_unavailable",
        "Credential validation is temporarily unavailable",
        503,
      );
    }
    console.error("Provider credential replacement failed");
    return errorResponse(
      "credential_update_failed",
      "Credential update failed",
      500,
    );
  }
}

export async function DELETE() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return errorResponse("not_authenticated", "Not authenticated", 401);
  }

  try {
    const credential = await deleteOpenRouterCredential(userId);
    return Response.json({ credential: safeCredentialResponse(credential) });
  } catch {
    console.error("Provider credential deletion failed");
    return errorResponse(
      "credential_delete_failed",
      "Credential deletion failed",
      500,
    );
  }
}
