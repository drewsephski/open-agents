import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { getPublicDemoOpenRouterConfig } = await import("./public-demo-model");

describe("public demo model configuration", () => {
  test("uses only the narrowly scoped public demo key", () => {
    expect(
      getPublicDemoOpenRouterConfig({
        OPENROUTER_API_KEY: "authenticated-deployment-key",
        OPENROUTER_PUBLIC_DEMO_API_KEY: "public-demo-key",
      }),
    ).toEqual({ apiKey: "public-demo-key" });
  });

  test("does not fall back to the authenticated deployment key", () => {
    expect(() =>
      getPublicDemoOpenRouterConfig({
        OPENROUTER_API_KEY: "authenticated-deployment-key",
      }),
    ).toThrow("Public demo inference is unavailable");
  });
});
