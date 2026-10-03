import { recoverProCheckout } from "@/lib/billing/billing-runtime";
import { getServerSession } from "@/lib/session/get-server-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user)
    return Response.json(
      { error: { code: "not_authenticated" } },
      { status: 401 },
    );
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: { code: "invalid_origin" } },
      { status: 403 },
    );

  try {
    await recoverProCheckout(session.user.id);
    return Response.json(
      { synced: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Creem Checkout recovery failed");
    return Response.json(
      { error: { code: "billing_sync_unavailable" } },
      { status: 503 },
    );
  }
}
