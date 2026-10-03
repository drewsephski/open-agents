import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { assertCheckoutReady, getCreemSessionConfig } =
  await import("./billing-config");

const configured = {
  NODE_ENV: "test",
  CREEM_API_KEY: "creem_test_local",
  CREEM_MODE: "test",
  CREEM_PRO_PRODUCT_ID: "prod_test",
  CREEM_WEBHOOK_SECRET: "test-signing-secret",
  OPENROUTER_MANAGEMENT_API_KEY: "test-management-key",
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  ENCRYPTION_KEY_VERSION: "1",
  LAUNCHSTACK_APP_ORIGIN: "http://localhost:3000",
};

describe("checkout readiness", () => {
  test("opens configured checkout without the obsolete launch flag", () => {
    expect(() => assertCheckoutReady(configured)).not.toThrow();
    expect(() =>
      assertCheckoutReady({ ...configured, PRO_CHECKOUT_ENABLED: "false" }),
    ).not.toThrow();
  });

  test.each([
    "CREEM_API_KEY",
    "CREEM_PRO_PRODUCT_ID",
    "CREEM_WEBHOOK_SECRET",
    "OPENROUTER_MANAGEMENT_API_KEY",
    "ENCRYPTION_KEY",
  ])("rejects checkout before taking payment when %s is missing", (name) => {
    expect(() => assertCheckoutReady({ ...configured, [name]: "" })).toThrow(
      name,
    );
  });

  test("requires explicit activation for live checkout but leaves test checkout available", () => {
    const live = {
      ...configured,
      CREEM_API_KEY: "creem_live_local",
      CREEM_MODE: "live",
    };
    expect(() => assertCheckoutReady(live)).toThrow("live payments");
    expect(() =>
      assertCheckoutReady({ ...live, CREEM_LIVE_PAYMENTS_ENABLED: "true" }),
    ).not.toThrow();
    expect(() => assertCheckoutReady(configured)).not.toThrow();
  });

  test("rejects invalid encryption keys and mismatched provider environments", () => {
    expect(() =>
      assertCheckoutReady({ ...configured, ENCRYPTION_KEY: "invalid" }),
    ).toThrow("256-bit");
    expect(() =>
      assertCheckoutReady({ ...configured, CREEM_MODE: "live" }),
    ).toThrow("do not match");
    expect(getCreemSessionConfig(configured).testMode).toBe(true);
    expect(
      getCreemSessionConfig({
        ...configured,
        CREEM_API_KEY: "creem_live_local",
        CREEM_MODE: "live",
      }).testMode,
    ).toBe(false);
  });
});
