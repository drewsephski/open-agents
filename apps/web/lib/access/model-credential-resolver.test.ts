import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { createModelCredentialResolver } =
  await import("./model-credential-resolver");

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("model credential resolver", () => {
  test("authorizes BYOK inference and returns explicit server-only OpenRouter configuration", async () => {
    const resolve = createModelCredentialResolver({
      loadAccessState: async () => ({
        byokCredential: {
          state: "valid",
          envelope: {
            ciphertext: "ciphertext",
            nonce: "nonce",
            authenticationTag: "authentication-tag",
            encryptionKeyVersion: 1,
          },
        },
        subscription: null,
        managedInference: {
          keyState: "missing",
          period: null,
          spentMicros: 0,
          reservedMicros: 0,
          envelope: null,
        },
      }),
      decrypt: (_envelope, context) =>
        context.source === "byok" ? "sk-or-v1-user-secret" : "unexpected",
      managedModelIds: ["z-ai/glm-5.3-flash"],
      now: () => NOW,
    });

    await expect(
      resolve({ userId: "user-1", modelId: "z-ai/glm-5.3-flash" }),
    ).resolves.toEqual({
      allowed: true,
      source: "byok",
      modelId: "z-ai/glm-5.3-flash",
      openRouter: { apiKey: "sk-or-v1-user-secret" },
    });
  });

  test("fails closed with structured remediation when no inference source exists", async () => {
    const resolve = createModelCredentialResolver({
      loadAccessState: async () => ({
        byokCredential: { state: "missing", envelope: null },
        subscription: null,
        managedInference: {
          keyState: "missing",
          period: null,
          spentMicros: 0,
          reservedMicros: 0,
          envelope: null,
        },
      }),
      decrypt: () => {
        throw new Error("decrypt must not run");
      },
      managedModelIds: ["z-ai/glm-5.3-flash"],
      now: () => NOW,
    });

    await expect(
      resolve({ userId: "user-1", modelId: "z-ai/glm-5.3-flash" }),
    ).resolves.toEqual({
      allowed: false,
      failure: {
        code: "inference_source_required",
        remediation: ["add_byok", "upgrade_to_pro"],
      },
    });
  });

  test("supports managed credentials without falling back to a deployment key", async () => {
    const resolve = createModelCredentialResolver({
      loadAccessState: async () => ({
        byokCredential: { state: "missing", envelope: null },
        subscription: {
          status: "active",
          entitlementState: "active",
          financialState: "paid",
          periodStart: new Date("2026-08-01T00:00:00.000Z"),
          periodEnd: new Date("2026-09-01T00:00:00.000Z"),
          cancelAtPeriodEnd: false,
        },
        managedInference: {
          keyState: "active",
          period: {
            start: new Date("2026-08-01T00:00:00.000Z"),
            end: new Date("2026-09-01T00:00:00.000Z"),
          },
          spentMicros: 0,
          reservedMicros: 0,
          envelope: {
            ciphertext: "managed-ciphertext",
            nonce: "managed-nonce",
            authenticationTag: "managed-tag",
            encryptionKeyVersion: 1,
          },
        },
      }),
      decrypt: (_envelope, context) =>
        context.source === "managed" ? "managed-subkey" : "unexpected",
      managedModelIds: ["z-ai/glm-5.3-flash"],
      now: () => NOW,
    });

    await expect(
      resolve({ userId: "user-1", modelId: "z-ai/glm-5.3-flash" }),
    ).resolves.toEqual({
      allowed: true,
      source: "managed",
      modelId: "z-ai/glm-5.3-flash",
      openRouter: { apiKey: "managed-subkey" },
    });
  });

  test("does not leak credential failures when encrypted state cannot be resolved", async () => {
    const resolve = createModelCredentialResolver({
      loadAccessState: async () => ({
        byokCredential: {
          state: "valid",
          envelope: {
            ciphertext: "malformed-secret-data",
            nonce: "nonce",
            authenticationTag: "authentication-tag",
            encryptionKeyVersion: 1,
          },
        },
        subscription: null,
        managedInference: {
          keyState: "missing",
          period: null,
          spentMicros: 0,
          reservedMicros: 0,
          envelope: null,
        },
      }),
      decrypt: () => {
        throw new Error("provider body containing sk-or-v1-secret");
      },
      managedModelIds: ["z-ai/glm-5.3-flash"],
      now: () => NOW,
    });

    const result = await resolve({
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
    });

    expect(result).toEqual({
      allowed: false,
      failure: {
        code: "access_state_invalid",
        remediation: ["retry_later"],
      },
    });
    expect(JSON.stringify(result)).not.toContain("sk-or-v1-secret");
  });
});
