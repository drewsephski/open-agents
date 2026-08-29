import { createProCheckoutSession } from "@/lib/billing/billing-runtime";
import { getServerSession } from "@/lib/session/get-server-session";

function errorResponse(code: string, status: number) {
  return Response.json({ error: { code } }, { status });
}

export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return errorResponse("not_authenticated", 401);
  }

  try {
    const checkout = await createProCheckoutSession({
      userId: session.user.id,
      email: session.user.email ?? null,
    });
    return Response.json(checkout);
  } catch {
    console.error("Pro Checkout Session creation failed");
    return errorResponse("checkout_unavailable", 503);
  }
}
