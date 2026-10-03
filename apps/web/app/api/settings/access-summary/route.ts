import { executionBackendSchema } from "@/lib/access/execution-backend";
import { z } from "zod";
import { getAccessSummary } from "@/lib/access/access-summary";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(request?: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json(
      { error: { code: "not_authenticated" } },
      { status: 401 },
    );
  }

  try {
    const rawModelId = request
      ? new URL(request.url).searchParams.get("modelId")
      : null;
    const parsedModelId = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .safeParse(rawModelId);
    if (rawModelId !== null && !parsedModelId.success) {
      return Response.json(
        { error: { code: "invalid_model_id" } },
        { status: 400 },
      );
    }
    const rawBackend = request
      ? new URL(request.url).searchParams.get("executionBackend")
      : null;
    const backend = executionBackendSchema.safeParse(rawBackend);
    if (rawBackend !== null && !backend.success)
      return Response.json(
        { error: { code: "invalid_execution_backend" } },
        { status: 400 },
      );
    return Response.json({
      summary: await getAccessSummary(
        session.user.id,
        new Date(),
        parsedModelId.success ? parsedModelId.data : undefined,
        backend.success ? backend.data : undefined,
      ),
    });
  } catch {
    console.error("Access summary lookup failed");
    return Response.json(
      { error: { code: "access_summary_unavailable" } },
      { status: 503 },
    );
  }
}
