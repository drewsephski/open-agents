import { sanitizeInternalRedirect } from "@/lib/redirect-safety";

export function getAuthCallbackUrl(callbackUrl?: string | null): string {
  const destination = sanitizeInternalRedirect(callbackUrl, "/sessions");
  const pathname = new URL(destination, "https://open-agents.invalid").pathname;

  // Auth pages must never return to themselves after a successful sign-in.
  if (/^\/sign-(in|up)\/?$/.test(pathname)) {
    return "/sessions";
  }

  return destination;
}

export function getAuthPageHref(
  path: "/sign-in" | "/sign-up",
  callbackUrl?: string,
): string {
  const destination = getAuthCallbackUrl(callbackUrl);
  if (destination === "/sessions") {
    return path;
  }

  return `${path}?next=${encodeURIComponent(destination)}`;
}
