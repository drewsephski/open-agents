import { getServerSession } from "@/lib/session/get-server-session";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getNewChatBackend } from "@/lib/access/chat-backend";
import { createStack, listStacks } from "@/lib/db/stacks";
import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { createStackSchema } from "@/lib/stacks/schema";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  const [stacks, preferences, backend] = await Promise.all([
    listStacks(session.user.id),
    getUserPreferences(session.user.id),
    getNewChatBackend(session.user.id),
  ]);
  return Response.json({
    stacks,
    defaultConfiguration: buildDefaultStack(preferences, backend),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const limited = await checkRateLimit({
    key: rateLimitKey(["stacks-create", session.user.id]),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const parsed = createStackSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Stack" },
      { status: 400 },
    );
  const stack = await createStack(session.user.id, parsed.data);
  return Response.json({ stack }, { status: 201 });
}
