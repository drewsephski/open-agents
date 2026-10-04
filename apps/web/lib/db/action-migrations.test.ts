import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("the full migration chain preserves old Gmail connections and supports separate runtime scopes", async () => {
  const client = new PGlite();
  try {
    const directory = new URL("migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (file.startsWith("0046_")) {
        await client.exec(
          "INSERT INTO users (id, username) VALUES ('legacy-user', 'legacy'); INSERT INTO action_provider_sessions (user_id, provider_id, session_id) VALUES ('legacy-user', 'composio', 'old-gmail-session');",
        );
      }
      await client.exec(await readFile(new URL(file, directory), "utf8"));
    }
    const { rows } = await client.query(
      "SELECT user_id, provider_id, toolkit, session_id FROM action_provider_sessions",
    );
    expect(rows).toEqual([
      {
        user_id: "legacy-user",
        provider_id: "composio",
        toolkit: "gmail",
        session_id: "old-gmail-session",
      },
    ]);
    await client.exec(
      "INSERT INTO action_provider_sessions (user_id, provider_id, toolkit, session_id) VALUES ('legacy-user', 'composio', 'linear', 'linear-connection');",
    );
    await client.exec(
      "INSERT INTO sessions (id, user_id, title) VALUES ('session-1', 'legacy-user', 'Worker'); INSERT INTO chats (id, session_id, title) VALUES ('chat-1', 'session-1', 'Work');",
    );
    for (const scopeKey of ["read", "read-write"]) {
      await client.query(
        "INSERT INTO action_runtime_sessions (user_id, chat_id, provider_id, scope_key, scope, session_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          "legacy-user",
          "chat-1",
          "composio",
          scopeKey,
          JSON.stringify({
            tools: ["GMAIL_FETCH_EMAILS"],
            connectedAccounts: { gmail: "ca-1" },
          }),
          `runtime-${scopeKey}`,
        ],
      );
    }
    expect(
      (await client.query("SELECT session_id FROM action_runtime_sessions"))
        .rows,
    ).toHaveLength(2);
    await expect(
      client.exec(
        "INSERT INTO action_runtime_sessions SELECT * FROM action_runtime_sessions LIMIT 1",
      ),
    ).rejects.toThrow();
    await client.exec("DELETE FROM chats WHERE id = 'chat-1'");
    expect(
      (await client.query("SELECT * FROM action_runtime_sessions")).rows,
    ).toEqual([]);
    expect(
      (await client.query("SELECT * FROM action_provider_sessions")).rows,
    ).toHaveLength(2);
  } finally {
    await client.close();
  }
}, 30_000);
