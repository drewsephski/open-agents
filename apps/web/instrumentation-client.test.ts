import { describe, expect, mock, test } from "bun:test";

const initBotIdCalls: unknown[] = [];

mock.module("botid/client/core", () => ({
  initBotId: (config: unknown) => {
    initBotIdCalls.push(config);
  },
}));

describe("BotID client instrumentation", () => {
  test("protects the public stack recommender used by the homepage", async () => {
    const { botIdProtectedRoutes } = await import("./instrumentation-client");

    expect(botIdProtectedRoutes).toContainEqual({
      path: "/api/recommend-stack",
      method: "POST",
    });
  });

  test("protects session creation to match the server-side BotID gate", async () => {
    const { botIdProtectedRoutes } = await import("./instrumentation-client");

    expect(botIdProtectedRoutes).toContainEqual({
      path: "/api/sessions",
      method: "POST",
    });
    expect(initBotIdCalls).toContainEqual({
      protect: botIdProtectedRoutes,
    });
  });
});
