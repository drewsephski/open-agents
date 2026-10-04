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
      if (file.startsWith("0047_")) {
        await client.exec(`INSERT INTO sessions (id, user_id, title, stack_snapshot) VALUES ('upgrade-session', 'legacy-user', 'Before binding', '{"name":"Legacy Stack","version":1}');
          INSERT INTO chats (id, session_id, title) VALUES ('upgrade-chat', 'upgrade-session', 'Before binding');
          INSERT INTO action_runtime_sessions (user_id, chat_id, provider_id, scope_key, scope, session_id) VALUES ('legacy-user', 'upgrade-chat', 'composio', 'legacy-scope', '{"tools":["GMAIL_FETCH_EMAILS"],"connectedAccounts":{"gmail":"ca-original"}}', 'legacy-runtime');`);
      }
      await client.exec(await readFile(new URL(file, directory), "utf8"));
    }
    expect(
      (
        await client.query(
          "SELECT action_bindings, stack_snapshot FROM sessions WHERE id = 'upgrade-session'",
        )
      ).rows,
    ).toEqual([
      {
        action_bindings: null,
        stack_snapshot: { name: "Legacy Stack", version: 1 },
      },
    ]);
    expect(
      (
        await client.query(
          "SELECT scope, session_id FROM action_runtime_sessions WHERE chat_id = 'upgrade-chat'",
        )
      ).rows,
    ).toEqual([
      {
        scope: {
          tools: ["GMAIL_FETCH_EMAILS"],
          connectedAccounts: { gmail: "ca-original" },
        },
        session_id: "legacy-runtime",
      },
    ]);
    await expect(
      client.exec(
        'UPDATE sessions SET action_bindings = \'{"gmail":{"accountId":"ca-guessed","label":"Guess"}}\' WHERE id = \'upgrade-session\'',
      ),
    ).rejects.toThrow("immutable");
    await client.exec(
      'INSERT INTO sessions (id, user_id, title, action_bindings) VALUES (\'bound-session\', \'legacy-user\', \'Bound\', \'{"gmail":{"accountId":"ca-original","label":"Original"}}\')',
    );
    await expect(
      client.exec(
        "UPDATE sessions SET action_bindings = '{}' WHERE id = 'bound-session'",
      ),
    ).rejects.toThrow("immutable");
    await client.exec(
      "UPDATE sessions SET status = 'archived', title = 'Rename permitted' WHERE id = 'bound-session'",
    );
    await client.exec(
      "DELETE FROM sessions WHERE id IN ('bound-session', 'upgrade-session')",
    );
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
