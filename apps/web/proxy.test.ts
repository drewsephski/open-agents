import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { AUTH_REQUEST_PATH_HEADER } from "./lib/auth/request-path";

function makeRequest(path: string, accept: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { Accept: accept },
  });
}

describe("shared page content negotiation proxy", () => {
  test("rewrites markdown requests for shared pages", () => {
    const response = proxy(makeRequest("/shared/share-1", "text/markdown"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/api/shared/share-1/markdown",
    );
  });

  test("rewrites plain text requests for shared pages", () => {
    const response = proxy(makeRequest("/shared/share-1", "text/plain"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost/api/shared/share-1/markdown",
    );
  });

  test("does not rewrite html page requests", () => {
    const response = proxy(makeRequest("/shared/share-1", "text/html"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  test("does not rewrite non-GET requests", () => {
    const response = proxy(
      makeRequest("/shared/share-1", "text/markdown", "POST"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("auth return destination", () => {
  test("forwards the full requested path for server layouts", () => {
    const response = proxy(
      makeRequest("/sessions/session-1/chats/chat-1?tab=files", "text/html"),
    );
    expect(
      response.headers.get(`x-middleware-request-${AUTH_REQUEST_PATH_HEADER}`),
    ).toBe("/sessions/session-1/chats/chat-1?tab=files");
  });

  test("overwrites spoofed request path headers", () => {
    const response = proxy(
      new NextRequest("http://localhost/settings/billing?checkout=success", {
        headers: { [AUTH_REQUEST_PATH_HEADER]: "https://evil.example" },
      }),
    );
    expect(
      response.headers.get(`x-middleware-request-${AUTH_REQUEST_PATH_HEADER}`),
    ).toBe("/settings/billing?checkout=success");
  });

  test("preserves the route for HEAD requests", () => {
    const response = proxy(
      makeRequest("/codespace/session-1", "text/html", "HEAD"),
    );
    expect(
      response.headers.get(`x-middleware-request-${AUTH_REQUEST_PATH_HEADER}`),
    ).toBe("/codespace/session-1");
  });
});
