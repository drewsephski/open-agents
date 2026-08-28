import { headers } from "next/headers";
import { z } from "zod";
import { recommendTechStack } from "@/lib/ai/recommend-tech-stack";
import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const requestSchema = z.object({
  request: z.string().trim().min(12).max(1200),
});

export async function POST(request: Request) {
  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    "anonymous";
  const limited = await checkRateLimit({
    key: rateLimitKey(["recommend-stack", clientAddress]),
    limit: 8,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Describe the product in at least 12 characters." },
      { status: 400 },
    );
  }

  try {
    const recommendation = await recommendTechStack({
      productRequest: parsedBody.data.request,
      abortSignal: request.signal,
    });
    return Response.json(recommendation);
  } catch (error) {
    console.error(
      "[recommend-stack] Failed to generate recommendation:",
      error,
    );
    return Response.json(
      { error: "We couldn't compose a stack right now. Please try again." },
      { status: 500 },
    );
  }
}
