import { isLiveCheckoutEnabled } from "@/lib/billing/billing-config";
import { createProCheckoutSession } from "@/lib/billing/billing-runtime";
import { BillingSessionError } from "@/lib/billing/billing-sessions";
import { getServerSession } from "@/lib/session/get-server-session";

function errorResponse(code: string, status: number) {
  return Response.json({ error: { code } }, { status });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return errorResponse("not_authenticated", 401);
  }

  if (request.headers.get("origin") !== new URL(request.url).origin)
    return errorResponse("invalid_origin", 403);

  if (!isLiveCheckoutEnabled())
    return errorResponse("live_payments_not_enabled", 503);
  try {
    const checkout = await createProCheckoutSession({
      userId: session.user.id,
      email: session.user.email ?? null,
    });
    return Response.json(checkout);
  } catch (error) {
    if (
      error instanceof BillingSessionError &&
      error.code === "pro_subscription_exists"
    ) {
      return errorResponse("pro_subscription_exists", 409);
    }
    if (
      error instanceof BillingSessionError &&
      error.code === "billing_checkout_in_progress"
    ) {
      return errorResponse("billing_checkout_in_progress", 409);
    }
    console.error("Pro Checkout Session creation failed");
    return errorResponse("checkout_unavailable", 503);
  }
}
