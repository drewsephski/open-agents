import { getServerSession } from "@/lib/session/get-server-session";
import { publishStackVersion } from "@/lib/db/stacks";
import { publishStackSchema } from "@/lib/stacks/schema";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  context: { params: Promise<{ stackId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const limited = await checkRateLimit({
    key: rateLimitKey(["stacks-publish", session.user.id]),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const parsed = publishStackSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Stack" },
      { status: 400 },
    );
  const { stackId } = await context.params;
  const stack = await publishStackVersion(
    session.user.id,
    stackId,
    parsed.data.expectedVersion,
    parsed.data,
  );
  if (!stack)
    return Response.json(
      { error: "Stack changed or is unavailable. Refresh before saving." },
      { status: 409 },
    );
  return Response.json({ stack }, { status: 201 });
}
