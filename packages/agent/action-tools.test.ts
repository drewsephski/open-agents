import { expect, test } from "bun:test";
import { dynamicTool } from "ai";
import { z } from "zod";
import { createOpenAgent, openAgent } from "./open-agent";

test("per-call action tools are merged without changing shared coding tools", () => {
  const gmail = dynamicTool({
    inputSchema: z.object({}),
    needsApproval: true,
    execute: async () => ({ sent: true }),
  });
  const agent = createOpenAgent({ GMAIL_SEND_EMAIL: gmail });
  expect(agent.tools.GMAIL_SEND_EMAIL.needsApproval).toBe(true);
  expect(agent.tools.bash).toBe(openAgent.tools.bash);
  expect(Object.keys(openAgent.tools)).not.toContain("GMAIL_SEND_EMAIL");
  expect(Object.keys(agent.tools)).toEqual([
    ...Object.keys(openAgent.tools),
    "GMAIL_SEND_EMAIL",
  ]);
});

test("action providers cannot overwrite coding tools", () => {
  expect(() => createOpenAgent({ bash: openAgent.tools.bash })).toThrow(
    "collides with coding tool",
  );
});
