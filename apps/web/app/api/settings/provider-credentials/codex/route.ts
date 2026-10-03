import { z } from "zod";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  deleteCodexConnection,
  getCodexConnection,
  saveCodexConnection,
} from "@/lib/codex/credentials";
import { parseCodexAuthFile } from "@/lib/codex/auth-file";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

function response(connection: { connected: boolean }) {
  return Response.json(
    { connection: { connected: connection.connected } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  return response(await getCodexConnection(session.user.id));
}

export async function PUT(request: Request) {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const limited = await checkRateLimit({
    key: rateLimitKey(["codex-connect", session.user.id]),
    limit: 10,
    windowMs: 60000,
  });
  if (limited) return limited;
  const text = await request.text();
  if (Buffer.byteLength(text) > 100000)
    return Response.json({ error: "Login file is too large" }, { status: 413 });
  let authFile: string;
  try {
    const payload = z
      .object({ authFile: z.string().max(65536) })
      .parse(JSON.parse(text));
    authFile = parseCodexAuthFile(payload.authFile);
  } catch {
    return Response.json(
      {
        error:
          "Choose a Codex auth.json file from a ChatGPT login. API key logins are not supported here.",
      },
      { status: 400 },
    );
  }
  try {
    return response(await saveCodexConnection(session.user.id, authFile));
  } catch {
    return Response.json(
      { error: "Could not securely save your Codex connection. Try again." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  return response(await deleteCodexConnection(session.user.id));
}
