import { describe, expect, test } from "bun:test";
import { hasVercelProvider, resolveAuthProvider } from "./resolve-provider";

describe("auth provider resolution", () => {
  test("prefers credential accounts as the primary provider", () => {
    expect(resolveAuthProvider(["vercel", "credential"])).toBe("credential");
  });

  test("falls back to vercel then github", () => {
    expect(resolveAuthProvider(["github", "vercel"])).toBe("vercel");
    expect(resolveAuthProvider(["github"])).toBe("github");
  });

  test("defaults to credential when no providers are linked", () => {
    expect(resolveAuthProvider([])).toBe("credential");
  });

  test("detects a linked vercel account", () => {
    expect(hasVercelProvider(["credential", "vercel"])).toBe(true);
    expect(hasVercelProvider(["credential"])).toBe(false);
  });
});
