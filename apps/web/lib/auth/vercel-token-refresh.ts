import type { BetterAuthPlugin } from "better-auth";
import { refreshAccessToken } from "better-auth/oauth2";

/** Better Auth 1.6's Vercel provider omits refreshAccessToken entirely. */
export function vercelTokenRefresh(options: {
  clientId: string;
  clientSecret: string;
}): BetterAuthPlugin {
  return {
    id: "vercel-token-refresh",
    init(context) {
      const provider = context.socialProviders.find(
        (candidate) => candidate.id === "vercel",
      );
      if (provider && !provider.refreshAccessToken) {
        provider.refreshAccessToken = (refreshToken) =>
          refreshAccessToken({
            refreshToken,
            options,
            tokenEndpoint: "https://api.vercel.com/login/oauth/token",
          });
      }
    },
  };
}
