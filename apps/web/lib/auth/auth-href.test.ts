import { expect, test } from "bun:test";
import { getAuthPageHref } from "./auth-href";

test("omits the next param for the default sessions callback", () => {
  expect(getAuthPageHref("/sign-in")).toBe("/sign-in");
  expect(getAuthPageHref("/sign-up", "/sessions")).toBe("/sign-up");
});

test("preserves a custom callback as a next query param", () => {
  expect(getAuthPageHref("/sign-in", "/settings/profile")).toBe(
    "/sign-in?next=%2Fsettings%2Fprofile",
  );
});
