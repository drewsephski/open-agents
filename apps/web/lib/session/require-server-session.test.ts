import { beforeEach, expect, mock, test } from "bun:test";
import { AUTH_REQUEST_PATH_HEADER } from "@/lib/auth/request-path";
import type { Session } from "./types";

let requestHeaders: Headers;
let session: Session | undefined;

mock.module("next/headers", () => ({
  headers: async () => requestHeaders,
}));
mock.module("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));
mock.module("./get-server-session", () => ({
  getServerSession: async () => session,
}));

const modulePromise = import("./require-server-session");

beforeEach(() => {
  requestHeaders = new Headers();
  session = undefined;
});

test("redirects signed-out users to sign-in with the full requested route", async () => {
  requestHeaders.set(
    AUTH_REQUEST_PATH_HEADER,
    "/settings/billing?checkout=success",
  );
  const { requireServerSession } = await modulePromise;
  await expect(requireServerSession()).rejects.toThrow(
    "redirect:/sign-in?next=%2Fsettings%2Fbilling%3Fcheckout%3Dsuccess",
  );
});

test("uses the route fallback when no request path was forwarded", async () => {
  const { requireServerSession } = await modulePromise;
  await expect(requireServerSession("/get-started")).rejects.toThrow(
    "redirect:/sign-in?next=%2Fget-started",
  );
});

test("returns authenticated sessions without redirecting", async () => {
  session = {
    created: 0,
    authProvider: "credential",
    hasVercelAccount: false,
    user: { id: "user-1", username: "testuser", email: undefined, avatar: "" },
  };
  const { requireServerSession } = await modulePromise;
  expect(await requireServerSession()).toBe(session);
});
