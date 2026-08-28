import type { AuthProvider } from "@/lib/session/types";

export function resolveAuthProvider(
  providerIds: readonly string[],
): AuthProvider {
  if (providerIds.includes("credential")) {
    return "credential";
  }

  if (providerIds.includes("vercel")) {
    return "vercel";
  }

  if (providerIds.includes("github")) {
    return "github";
  }

  return "credential";
}

export function hasVercelProvider(providerIds: readonly string[]): boolean {
  return providerIds.includes("vercel");
}
