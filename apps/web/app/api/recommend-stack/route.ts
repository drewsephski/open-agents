import { defaultLanguageModel } from "@open-agents/agent";
import { generateText, Output } from "ai";
import { headers } from "next/headers";
import { z } from "zod";
import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { technologies, techStackRecommendationSchema } from "@/lib/tech-stack";

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

  const catalog = technologies
    .map(({ id, name, role }) => `${id}: ${name} — ${role}`)
    .join("\n");

  try {
    const { output } = await generateText({
      model: defaultLanguageModel(),
      output: Output.object({ schema: techStackRecommendationSchema }),
      prompt: `Act as a pragmatic staff engineer. Recommend the smallest production-ready technology stack for the product request below.

Choose 4 to 6 unique technology IDs only from this catalog:
${catalog}

Prioritize fit, maintainability, time-to-market, and operational simplicity. Do not add technology merely because it is popular. The headline should name the architectural approach, the summary should connect the choices to the request, and the tradeoff should honestly name the main compromise.

Product request:
${parsedBody.data.request}`,
    });

    if (!output) {
      throw new Error("The model returned no recommendation");
    }

    const recommendation = techStackRecommendationSchema.parse({
      ...output,
      technologyIds: [...new Set(output.technologyIds)],
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
