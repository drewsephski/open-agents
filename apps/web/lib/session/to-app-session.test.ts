import { describe, expect, test } from "bun:test";
import { toAppSession } from "./to-app-session";

describe("toAppSession", () => {
  test("maps credential accounts as the primary provider", () => {
    const session = toAppSession(
      {
        session: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
        user: {
          id: "user-1",
          email: "drew@example.com",
          name: "Drew",
          image: null,
          username: "drew",
        },
      },
      ["credential"],
    );

    expect(session).toEqual({
      created: Date.parse("2026-01-01T00:00:00.000Z"),
      authProvider: "credential",
      hasVercelAccount: false,
      user: {
        id: "user-1",
        username: "drew",
        email: "drew@example.com",
        avatar: "",
        name: "Drew",
      },
    });
  });

  test("keeps vercel-linked email users eligible for vercel features", () => {
    const session = toAppSession(
      {
        session: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
        user: {
          id: "user-2",
          email: "drew@example.com",
          name: "Drew",
          image: "https://example.com/avatar.png",
          username: "drew",
        },
      },
      ["credential", "vercel"],
    );

    expect(session.authProvider).toBe("credential");
    expect(session.hasVercelAccount).toBe(true);
  });
});
