import { expect, test } from "bun:test";
import { getAuthCallbackUrl, getAuthPageHref } from "./auth-href";

test("omits the next param for the default sessions callback", () => {
  expect(getAuthPageHref("/sign-in")).toBe("/sign-in");
  expect(getAuthPageHref("/sign-up", "/sessions")).toBe("/sign-up");
});

test("preserves a custom callback as a next query param", () => {
  expect(getAuthPageHref("/sign-in", "/settings/profile")).toBe(
    "/sign-in?next=%2Fsettings%2Fprofile",
  );
});

test("preserves query strings and fragments across auth mode switches", () => {
  const destination = "/settings/billing?checkout=success#plan";
  const signIn = new URL(
    getAuthPageHref("/sign-in", destination),
    "http://localhost",
  );
  const signUp = new URL(
    getAuthPageHref("/sign-up", signIn.searchParams.get("next") ?? undefined),
    "http://localhost",
  );
  expect(signUp.searchParams.get("next")).toBe(destination);
});

test("rejects external destinations and auth-page redirect loops", () => {
  for (const destination of [
    "https://evil.example/settings",
    "//evil.example/settings",
    "/\\evil.example/settings",
    "/sign-in?next=%2Fsettings",
    "/sign-up/",
  ]) {
    expect(getAuthCallbackUrl(destination)).toBe("/sessions");
    expect(getAuthPageHref("/sign-in", destination)).toBe("/sign-in");
  }
});
