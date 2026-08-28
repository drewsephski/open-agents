import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

let getSandboxProviderConfig: typeof import("./provider-config").getSandboxProviderConfig;

beforeAll(async () => {
  ({ getSandboxProviderConfig } = await import("./provider-config"));
});

describe("sandbox provider configuration", () => {
  test("keeps an existing Vercel-only deployment valid without optional credentials", () => {
    const config = getSandboxProviderConfig({});
    expect(config.providerOrder).toEqual(["vercel", "codesandbox"]);
    expect(config.providerOptions.vercel?.enabled).toBe(true);
    expect(config.providerOptions.codesandbox).toBeUndefined();
  });

  test("enables CodeSandbox automatically when credentials are present", () => {
    const config = getSandboxProviderConfig({ CSB_API_KEY: "csb-secret" });
    expect(config.providerOptions.codesandbox).toMatchObject({
      enabled: true,
      apiKey: "csb-secret",
    });
  });

  test("supports an instant CodeSandbox fallback kill switch", () => {
    const config = getSandboxProviderConfig({
      CSB_API_KEY: "csb-secret",
      CODESANDBOX_ENABLED: "false",
    });
    expect(config.providerOptions.codesandbox?.enabled).toBe(false);
  });

  test("rejects explicitly enabled CodeSandbox without credentials", () => {
    expect(() =>
      getSandboxProviderConfig({ CODESANDBOX_ENABLED: "true" }),
    ).toThrow("requires CSB_API_KEY");
  });

  test("rejects duplicate and unknown provider order entries", () => {
    expect(() =>
      getSandboxProviderConfig({
        SANDBOX_PROVIDER_ORDER: "vercel,vercel",
      }),
    ).toThrow("duplicates");
    expect(() =>
      getSandboxProviderConfig({
        SANDBOX_PROVIDER_ORDER: "vercel,modal",
      }),
    ).toThrow("supports only");
  });
});
