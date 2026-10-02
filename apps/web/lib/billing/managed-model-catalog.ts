import { APP_DEFAULT_MODEL_ID } from "@/lib/models";

type ManagedModelEnvironment = Readonly<Record<string, string | undefined>>;

export function getManagedModelIds(
  environment: ManagedModelEnvironment = process.env,
): readonly string[] {
  const configured =
    environment.MANAGED_OPENROUTER_MODEL_IDS?.split(",")
      .map((modelId) => modelId.trim())
      .filter(Boolean) ?? [];
  return [...new Set([APP_DEFAULT_MODEL_ID, ...configured])];
}
