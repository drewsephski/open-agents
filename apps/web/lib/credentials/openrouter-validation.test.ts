import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const validationModulePromise = import("./openrouter-validation");

describe("OpenRouter credential validation", () => {
  test("validates through the authenticated current-key metadata endpoint without inference", async () => {
    const { validateOpenRouterCredential } = await validationModulePromise;
    const fetchSpy = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe("https://openrouter.ai/api/v1/key");
        expect(init?.method).toBe("GET");
        expect(init?.headers).toEqual({
          Accept: "application/json",
          Authorization: "Bearer sk-or-v1-sensitive",
        });
        expect(init?.body).toBeUndefined();
        return Response.json({ data: { label: "Production key" } });
      },
    );

    const result = await validateOpenRouterCredential("sk-or-v1-sensitive", {
      fetch: fetchSpy,
    });

    expect(result).toEqual({ state: "valid", label: "Production key" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("classifies rejected and revoked keys without exposing provider bodies", async () => {
    const { validateOpenRouterCredential } = await validationModulePromise;

    const invalid = await validateOpenRouterCredential("invalid-secret", {
      fetch: async () =>
        Response.json(
          { error: { message: "provider echoed invalid-secret" } },
          { status: 401 },
        ),
    });
    const revoked = await validateOpenRouterCredential("revoked-secret", {
      fetch: async () =>
        Response.json(
          { error: { message: "provider echoed revoked-secret" } },
          { status: 403 },
        ),
    });

    expect(invalid).toEqual({ state: "invalid" });
    expect(revoked).toEqual({ state: "revoked" });
    expect(JSON.stringify([invalid, revoked])).not.toContain("secret");
  });

  test("surfaces only a stable safe error when OpenRouter is unavailable", async () => {
    const {
      OpenRouterValidationUnavailableError,
      validateOpenRouterCredential,
    } = await validationModulePromise;

    const validation = validateOpenRouterCredential("sk-or-v1-sensitive", {
      fetch: async () =>
        Response.json(
          { error: { message: "upstream body included sk-or-v1-sensitive" } },
          { status: 500 },
        ),
    });

    await expect(validation).rejects.toBeInstanceOf(
      OpenRouterValidationUnavailableError,
    );
    await expect(validation).rejects.toThrow(
      "OpenRouter credential validation is unavailable",
    );
    await expect(validation).rejects.not.toThrow("sk-or-v1-sensitive");
  });

  test("normalizes provider labels before returning safe metadata", async () => {
    const { validateOpenRouterCredential } = await validationModulePromise;
    const result = await validateOpenRouterCredential("sk-or-v1-sensitive", {
      fetch: async () =>
        Response.json({ data: { label: `  Work\nKey ${"x".repeat(100)} ` } }),
    });

    expect(result).toEqual({
      state: "valid",
      label: `Work Key ${"x".repeat(71)}`,
    });
  });

  test("replaces a provider label that echoes the submitted plaintext key", async () => {
    const { validateOpenRouterCredential } = await validationModulePromise;
    const result = await validateOpenRouterCredential("sk-or-v1-sensitive", {
      fetch: async () =>
        Response.json({
          data: { label: "Credential sk-or-v1-sensitive" },
        }),
    });

    expect(result).toEqual({ state: "valid", label: "OpenRouter key" });
    expect(JSON.stringify(result)).not.toContain("sk-or-v1-sensitive");
  });
});
