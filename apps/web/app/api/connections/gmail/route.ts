import {
  ensureActionSession,
  findActionSession,
} from "@/lib/db/action-sessions";
import { getActionProvider } from "@/lib/actions/runtime";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET() {
  const auth = await getServerSession();
  if (!auth?.user.id)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const provider = getActionProvider();
    if (!provider)
      return Response.json({ enabled: false, status: "not_connected" });
    const session = await findActionSession(auth.user.id, provider.id);
    const status = session
      ? await provider.getConnectionStatus(session)
      : "not_connected";
    return Response.json(
      { enabled: true, status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to check the Gmail connection. Try again." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await getServerSession();
  if (!auth?.user.id)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const provider = getActionProvider();
    if (!provider)
      return Response.json(
        { error: "Gmail connections are not configured" },
        { status: 503 },
      );
    const session = await ensureActionSession(auth.user.id, provider);
    const callbackUrl = new URL("/settings/connections", request.url).href;
    const redirectUrl = await provider.connect(session, callbackUrl);
    return Response.json(
      { redirectUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Unable to connect Gmail. Try again." },
      { status: 502 },
    );
  }
}
