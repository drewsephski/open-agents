import { describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
mock.module("server-only", () => ({}));
mock.module("@/lib/db/client", () => ({ db: {} }));
const { createCodexRunLeaseStore } = await import("./run-lease");

describe("Codex User run lease", () => {
  test("serializes concurrent chats, permits replay and protects a replacement lease", async () => {
    const client = new PGlite();
    try {
      await client.exec(
        "CREATE TABLE codex_run_leases (user_id text PRIMARY KEY, run_id text NOT NULL, expires_at timestamp NOT NULL)",
      );
      const store = createCodexRunLeaseStore(
        drizzle(client) as unknown as Parameters<
          typeof createCodexRunLeaseStore
        >[0],
      );
      const now = new Date("2026-10-03T12:00:00Z");
      const results = await Promise.all([
        store.acquire("owner", "one", now),
        store.acquire("owner", "two", now),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const winner = results[0] ? "one" : "two";
      expect(await store.acquire("owner", winner, now)).toBe(true);
      expect(await store.acquire("other", "three", now)).toBe(true);
      expect(
        await store.acquire("owner", "new", new Date("2026-10-03T12:13:00Z")),
      ).toBe(true);
      await store.release("owner", winner);
      expect(
        await store.acquire(
          "owner",
          "blocked",
          new Date("2026-10-03T12:14:00Z"),
        ),
      ).toBe(false);
      await store.release("owner", "new");
      expect(await store.acquire("owner", "fresh", now)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
