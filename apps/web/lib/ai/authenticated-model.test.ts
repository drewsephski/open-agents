import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const modelCalls: unknown[][] = [];
const credentialCalls: unknown[] = [];

mock.module("@open-agents/agent", () => ({
  model: (...args: unknown[]) => {
    modelCalls.push(args);
    return "language-model";
  },
}));

mock.module("@/lib/access/model-credential-resolver", () => ({
  requireModelCredential: async (params: unknown) => {
    credentialCalls.push(params);
    return {
      allowed: true,
      source: "byok",
      modelId: "z-ai/glm-5.3-flash",
      openRouter: { apiKey: "user-owned-key" },
    };
  },
}));

const { getAuthenticatedLanguageModel } = await import("./authenticated-model");

describe("authenticated language model", () => {
  test("resolves User authorization and passes only explicit configuration to the model factory", async () => {
    const languageModel = await getAuthenticatedLanguageModel({
      userId: "user-1",
      modelId: "z-ai/glm-5.3-flash",
    });

    expect(languageModel).toBe("language-model");
    expect(credentialCalls).toEqual([
      { userId: "user-1", modelId: "z-ai/glm-5.3-flash" },
    ]);
    expect(modelCalls).toEqual([
      [
        "z-ai/glm-5.3-flash",
        {
          config: { apiKey: "user-owned-key" },
          providerOptionsOverrides: undefined,
        },
      ],
    ]);
  });
});
