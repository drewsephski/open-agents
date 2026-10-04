import { afterAll, beforeEach, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const originalKey = process.env.COMPOSIO_API_KEY;
let capturedLimit = 0;
let rows: Array<{ sessionId: string }>;
const removed: string[] = [];
let concurrent = 0;
let maxConcurrent = 0;
mock.module("./client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (limit: number) => {
            capturedLimit = limit;
            return rows.slice(0, limit);
          },
        }),
      }),
    }),
  },
}));
mock.module("@/lib/actions/composio", () => ({
  createComposioActionProvider: () => ({
    deleteSession: async (id: string) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      removed.push(id);
      concurrent--;
    },
  }),
}));
const { prepareActionRuntimeCleanup } =
  await import("./action-runtime-cleanup");
beforeEach(() => {
  process.env.COMPOSIO_API_KEY = "test-key";
  rows = Array.from({ length: 70 }, (_, i) => ({ sessionId: `runtime-${i}` }));
  removed.length = 0;
  capturedLimit = 0;
  concurrent = 0;
  maxConcurrent = 0;
});
afterAll(() => {
  if (originalKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = originalKey;
});
test("deletion captures references before the FK cascade and performs bounded cleanup afterward", async () => {
  const cleanup = await prepareActionRuntimeCleanup({ chatId: "chat" });
  expect(removed).toEqual([]);
  expect(capturedLimit).toBe(50);
  rows = [];
  await cleanup();
  expect(removed).toHaveLength(50);
  expect(maxConcurrent).toBe(5);
});
test("unconfigured provider does not attempt remote cleanup", async () => {
  delete process.env.COMPOSIO_API_KEY;
  await (
    await prepareActionRuntimeCleanup({ chatId: "chat" })
  )();
  expect(removed).toEqual([]);
});
