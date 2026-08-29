import { createCustomerPortalSession } from "@/lib/billing/billing-runtime";
import { BillingSessionError } from "@/lib/billing/billing-sessions";
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
    return Response.json(
      await createCustomerPortalSession({ userId: session.user.id }),
    );
  } catch (error) {
    if (
      error instanceof BillingSessionError &&
      error.code === "billing_customer_required"
    ) {
      return errorResponse("billing_customer_required", 409);
    }
    console.error("Customer Portal Session creation failed");
    return errorResponse("billing_portal_unavailable", 503);
  }
}
