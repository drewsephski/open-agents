import {
  ensureActionSession,
  findActionSession,
} from "@/lib/db/action-sessions";
import { getActionProvider } from "./runtime";
import { ACTION_TOOLKITS, actionToolkitSchema } from "./registry";
import { getServerSession } from "@/lib/session/get-server-session";

export async function getConnectionStatus(toolkitValue: string) {
  const auth = await getServerSession();
  if (!auth?.user.id)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = actionToolkitSchema.safeParse(toolkitValue);
  if (!parsed.success)
    return Response.json({ error: "Unknown connection" }, { status: 404 });
  const toolkit = parsed.data;
  try {
    const provider = getActionProvider();
    if (!provider)
      return Response.json(
        { enabled: false, status: "not_connected" },
        { headers: { "Cache-Control": "no-store" } },
      );
    const session = await findActionSession(auth.user.id, provider.id, toolkit);
    const connection = session
      ? await provider.getConnection(session, toolkit)
      : { status: "not_connected" };
    return Response.json(
      { enabled: true, status: connection.status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: `Unable to check the ${ACTION_TOOLKITS[toolkit].label} connection. Try again.`,
      },
      { status: 502 },
    );
  }
}

export async function connectToolkit(request: Request, toolkitValue: string) {
  const auth = await getServerSession();
  if (!auth?.user.id)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = actionToolkitSchema.safeParse(toolkitValue);
  if (!parsed.success)
    return Response.json({ error: "Unknown connection" }, { status: 404 });
  const toolkit = parsed.data;
  try {
    const provider = getActionProvider();
    if (!provider)
      return Response.json(
        {
          error: `${ACTION_TOOLKITS[toolkit].label} connections are not configured`,
        },
        { status: 503 },
      );
    const session = await ensureActionSession(auth.user.id, provider, toolkit);
    const redirectUrl = await provider.connect(
      session,
      toolkit,
      new URL("/settings/connections", request.url).href,
    );
    return Response.json(
      { redirectUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: `Unable to connect ${ACTION_TOOLKITS[toolkit].label}. Try again.`,
      },
      { status: 502 },
    );
  }
}
