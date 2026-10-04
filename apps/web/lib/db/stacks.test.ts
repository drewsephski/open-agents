import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { toUserPreferencesData } from "./user-preferences";
import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { freezeStackLaunch } from "@/lib/stacks/launch";

mock.module("server-only", () => ({}));
const client = new PGlite();
const database = drizzle(client, { schema });
mock.module("./client", () => ({ db: database }));
const { createStack, getOwnedStackVersion, listStacks, publishStackVersion } =
  await import("./stacks");
const { createSessionWithInitialChat } = await import("./sessions");
const configuration = buildDefaultStack(
  toUserPreferencesData(),
  "launchstack_native",
);

beforeAll(async () => {
  const directory = new URL("migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await client.exec(await readFile(new URL(file, directory), "utf8"));
  }
  await database.insert(schema.users).values([
    { id: "owner", username: "owner" },
    { id: "other", username: "other" },
  ]);
});
afterAll(async () => {
  await client.close();
});

test("publishes immutable versions and binds an atomic Session/chat launch to its original snapshot", async () => {
  const first = await createStack("owner", {
    name: "Shipping",
    description: "Features",
    configuration,
  });
  const snapshot = freezeStackLaunch({ ...first, hasRepository: true });
  const launched = await createSessionWithInitialChat({
    session: {
      id: "run-1",
      userId: "owner",
      title: "Real work",
      stackVersionId: first.versionId,
      stackSnapshot: snapshot,
    },
    initialChat: {
      id: "chat-1",
      title: "New chat",
      executionBackend: "launchstack_native",
      modelId: configuration.model!.id,
    },
  });
  expect(launched.chat.sessionId).toBe(launched.session.id);
  const second = await publishStackVersion("owner", first.id, 1, {
    name: "Shipping",
    description: "Updated",
    configuration: {
      ...configuration,
      instructions: "New behavior",
      missionType: "fix_bug",
    },
  });
  expect(second?.version).toBe(2);
  expect(
    (await getOwnedStackVersion("owner", first.versionId))?.configuration
      .instructions,
  ).toBe("");
  expect(
    (await listStacks("owner")).find((stack) => stack.id === first.id)?.version,
  ).toBe(2);
  const [session] = await database
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, "run-1"));
  expect(session?.stackSnapshot).toEqual(snapshot);
  await expect(
    Promise.resolve(
      database
        .update(schema.agentStackVersions)
        .set({ instructions: "rewrite history" })
        .where(eq(schema.agentStackVersions.id, first.versionId)),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      database
        .update(schema.sessions)
        .set({ stackSnapshot: { ...snapshot, name: "Tampered" } })
        .where(eq(schema.sessions.id, "run-1")),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      database
        .update(schema.sessions)
        .set({ stackVersionId: second!.versionId })
        .where(eq(schema.sessions.id, "run-1")),
    ),
  ).rejects.toThrow();
  await database
    .update(schema.sessions)
    .set({ title: "Rename is allowed" })
    .where(eq(schema.sessions.id, "run-1"));
});

test("ownership and optimistic concurrency prevent cross-user access and lost edits", async () => {
  const first = await createStack("owner", {
    name: "Repair",
    description: "CI",
    configuration,
  });
  expect(await getOwnedStackVersion("other", first.versionId)).toBeUndefined();
  expect(await listStacks("other")).toEqual([]);
  expect(
    await publishStackVersion("other", first.id, 1, {
      name: "Stolen",
      description: "",
      configuration,
    }),
  ).toBeUndefined();
  const results = await Promise.all(
    ["A", "B"].map((name) =>
      publishStackVersion("owner", first.id, 1, {
        name,
        description: "",
        configuration,
      }),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  const versions = await database
    .select()
    .from(schema.agentStackVersions)
    .where(eq(schema.agentStackVersions.stackId, first.id));
  expect(versions.map((version) => version.version).sort()).toEqual([1, 2]);
});
