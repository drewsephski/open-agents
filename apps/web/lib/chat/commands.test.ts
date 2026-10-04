import { describe, expect, test } from "bun:test";
import {
  CHAT_COMMANDS,
  getCommandGuidance,
  isLocalHelpCommand,
  isReadOnlyCommand,
} from "./commands";
import { getResponseGuidance } from "./response-guidance";
const user = (text: string) => ({
  role: "user",
  parts: [{ type: "text", text }],
});
describe("app commands", () => {
  test("help is local only when it has no task or attachments", () => {
    expect(isLocalHelpCommand("  /HELP  ")).toBe(true);
    for (const text of [
      "$help",
      "/help details",
      "Explain /help",
      "/help-other",
    ])
      expect(isLocalHelpCommand(text)).toBe(false);
    expect(isLocalHelpCommand("/help", true)).toBe(false);
    expect(CHAT_COMMANDS.map((command) => command.name)).toEqual([
      "help",
      "plan",
      "review",
      "explain",
      "pstack",
      "pstack-off",
    ]);
  });
  test("read-only commands override implementation guidance for the current turn only", () => {
    for (const name of ["help", "plan", "review", "explain"]) {
      const messages = [user("/pstack"), user(`/${name} checkout`)];
      expect(getResponseGuidance(messages)).toContain(
        `# Current command: /${name}`,
      );
      expect(isReadOnlyCommand(messages)).toBe(true);
      expect(isReadOnlyCommand([...messages, user("Implement it")])).toBe(
        false,
      );
      expect(getCommandGuidance([user(`$${name} checkout`)])).toBe("");
    }
    expect(getCommandGuidance([user("/plan")])).toContain(
      "Ask what task to plan",
    );
    expect(getCommandGuidance([user("/explain")])).toContain(
      "Ask what to explain",
    );
    expect(
      getCommandGuidance([
        user("/plan checkout"),
        { role: "assistant", parts: [{ type: "text", text: "/review" }] },
      ]),
    ).toContain("/plan");
  });
});
