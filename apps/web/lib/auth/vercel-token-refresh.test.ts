import { afterEach, describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { vercelTokenRefresh } from "./vercel-token-refresh";

const originalFetch = globalThis.fetch;
const secret = "test-secret-long-enough-for-better-auth";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Vercel token refresh", () => {
  test("refreshes an expired encrypted account and persists the rotated token pair", async () => {
    const now = new Date();
    const account = {
      id: "account-1",
      userId: "user-1",
      accountId: "vercel-user-1",
      providerId: "vercel",
      accessToken: await symmetricEncrypt({
        key: secret,
        data: "expired-access",
      }),
      refreshToken: await symmetricEncrypt({ key: secret, data: "refresh-1" }),
      accessTokenExpiresAt: new Date(Date.now() - 60_000),
      createdAt: now,
      updatedAt: now,
    };
    const database = {
      user: [],
      session: [],
      account: [account],
      verification: [],
    };
    const auth = betterAuth({
      secret,
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      account: { encryptOAuthTokens: true },
      socialProviders: {
        vercel: { clientId: "client-id", clientSecret: "client-secret" },
      },
      plugins: [
        vercelTokenRefresh({
          clientId: "client-id",
          clientSecret: "client-secret",
        }),
      ],
    });
    let refreshCount = 0;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(input.toString()).toBe(
          "https://api.vercel.com/login/oauth/token",
        );
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("refresh-1");
        expect(body.get("client_id")).toBe("client-id");
        expect(body.get("client_secret")).toBe("client-secret");
        refreshCount += 1;
        return Response.json({
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 3600,
          token_type: "Bearer",
        });
      },
      { preconnect: originalFetch.preconnect },
    );

    const result = await auth.api.getAccessToken({
      body: { providerId: "vercel", userId: "user-1" },
    });
    expect(result.accessToken).toBe("access-2");
    expect(result.accessTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    const stored = database.account[0];
    expect(stored).toBeDefined();
    if (!stored) throw new Error("Missing account");
    expect(stored.accessToken).not.toBe("access-2");
    expect(
      await symmetricDecrypt({ key: secret, data: stored.accessToken }),
    ).toBe("access-2");
    expect(
      await symmetricDecrypt({ key: secret, data: stored.refreshToken }),
    ).toBe("refresh-2");
    const second = await auth.api.getAccessToken({
      body: { providerId: "vercel", userId: "user-1" },
    });
    expect(second.accessToken).toBe("access-2");
    expect(refreshCount).toBe(1);
  });

  test("does not replace a provider's existing refresh implementation", async () => {
    const refresh = async () => ({ accessToken: "native" });
    const auth = betterAuth({
      secret,
      baseURL: "http://localhost:3000",
      socialProviders: {
        github: {
          clientId: "client-id",
          clientSecret: "client-secret",
          refreshAccessToken: refresh,
        },
      },
      plugins: [
        vercelTokenRefresh({
          clientId: "client-id",
          clientSecret: "client-secret",
        }),
      ],
    });
    expect((await auth.$context).socialProviders[0]?.refreshAccessToken).toBe(
      refresh,
    );
  });
});
