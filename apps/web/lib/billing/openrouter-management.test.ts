import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { createOpenRouterManagementClient, OpenRouterManagementError } =
  await import("./openrouter-management");

describe("OpenRouter Management API client", () => {
  test("creates an isolated $10 paid-period key that expires with the paid period", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = createOpenRouterManagementClient({
      managementKey: "management-secret",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return Response.json(
          {
            data: {
              hash: "hash-1",
              label: "Launchstack managed abc",
              disabled: false,
            },
            key: "sk-or-v1-managed-secret",
          },
          { status: 201 },
        );
      },
    });

    await expect(
      client.createKey({
        name: "Launchstack managed abc",
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      providerKeyId: "hash-1",
      plaintext: "sk-or-v1-managed-secret",
      label: "Launchstack managed abc",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/keys");
    expect(requests[0]?.init.method).toBe("POST");
    expect(requests[0]?.init.headers).toEqual({
      Authorization: "Bearer management-secret",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      name: "Launchstack managed abc",
      expires_at: "2026-09-01T00:00:00.000Z",
      include_byok_in_limit: false,
      limit: 10,
      limit_reset: null,
    });
  });

  test("disables a managed key without exposing provider response details", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = createOpenRouterManagementClient({
      managementKey: "management-secret",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return Response.json({ data: { hash: "hash/one", disabled: true } });
      },
    });

    await client.disableKey("hash/one");

    expect(requests[0]?.url).toBe(
      "https://openrouter.ai/api/v1/keys/hash%2Fone",
    );
    expect(requests[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      disabled: true,
    });
  });

  test("returns a stable redacted failure for management errors", async () => {
    const client = createOpenRouterManagementClient({
      managementKey: "management-secret",
      fetch: async () =>
        Response.json(
          { error: { message: "echoed management-secret" } },
          { status: 503 },
        ),
    });

    const error = await client
      .createKey({
        name: "Launchstack managed abc",
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OpenRouterManagementError);
    expect(String(error)).toBe(
      "OpenRouterManagementError: management_unavailable",
    );
    expect(String(error)).not.toContain("management-secret");
  });

  test("finds active orphan keys by deterministic name for retry cleanup", async () => {
    const client = createOpenRouterManagementClient({
      managementKey: "management-secret",
      fetch: async () =>
        Response.json({
          data: [
            { hash: "hash-active", name: "managed-name", disabled: false },
            { hash: "hash-disabled", name: "managed-name", disabled: true },
            { hash: "hash-other", name: "other-name", disabled: false },
          ],
        }),
    });

    await expect(client.findKeyIdsByName("managed-name")).resolves.toEqual([
      "hash-active",
    ]);
  });
});
