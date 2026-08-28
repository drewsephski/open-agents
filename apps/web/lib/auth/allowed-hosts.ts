export interface AuthHostEnv {
  BETTER_AUTH_URL?: string;
  VERCEL_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?: string;
}

function normalizeHost(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`,
    ).host;
  } catch {
    return null;
  }
}

function getWildcardHostPattern(host: string): string | null {
  const hostname = host.split(":")[0];
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname?.startsWith("[")
  ) {
    return null;
  }

  return `*.${host}`;
}

export function getAllowedAuthHosts(env: AuthHostEnv = process.env): string[] {
  // Next.js binds 3001+ when 3000 is taken. Better Auth matches `host:port`.
  const hosts = new Set<string>(["localhost:*", "127.0.0.1:*"]);

  for (const value of [
    env.BETTER_AUTH_URL,
    env.VERCEL_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const host = normalizeHost(value);
    if (!host) {
      continue;
    }

    hosts.add(host);

    const wildcardPattern = getWildcardHostPattern(host);
    if (wildcardPattern) {
      hosts.add(wildcardPattern);
    }
  }

  return [...hosts];
}
