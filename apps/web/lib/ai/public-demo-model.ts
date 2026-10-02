import "server-only";
import type { OpenRouterConfig } from "@open-agents/agent";

export function getPublicDemoOpenRouterConfig(
  env: NodeJS.Dict<string> = process.env,
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_PUBLIC_DEMO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Public demo inference is unavailable");
  }
  return { apiKey };
}
