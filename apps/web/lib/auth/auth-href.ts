export function getAuthPageHref(
  path: "/sign-in" | "/sign-up",
  callbackUrl?: string,
): string {
  if (!callbackUrl || callbackUrl === "/sessions") {
    return path;
  }

  return `${path}?next=${encodeURIComponent(callbackUrl)}`;
}
