import { describe, expect, test } from "bun:test";
import { resolveEngineeringMode } from "./engineering-mode";

const user = (text: string) => ({
  role: "user",
  parts: [{ type: "text", text }],
});

describe("engineering mode conversation commands", () => {
  test("defaults to standard and keeps activation across replies and follow-up turns", () => {
    expect(resolveEngineeringMode([user("Explain the app")])).toEqual({
      enabled: false,
      commandOnly: false,
    });
    const history = [
      user("/pstack Fix the bug"),
      { role: "assistant", parts: [{ type: "text", text: "Investigating" }] },
      user("Continue"),
    ];
    expect(resolveEngineeringMode(history)).toEqual({
      enabled: true,
      commandOnly: false,
    });
    expect(resolveEngineeringMode(structuredClone(history))).toEqual({
      enabled: true,
      commandOnly: false,
    });
  });

  test("the latest explicit command wins, including reactivation", () => {
    const history = [user("/pstack"), user("/pstack-off"), user("Fix the bug")];
    expect(resolveEngineeringMode(history)).toEqual({
      enabled: false,
      commandOnly: false,
    });
    expect(resolveEngineeringMode([...history, user("  /PSTACK  ")])).toEqual({
      enabled: true,
      commandOnly: true,
    });
    expect(resolveEngineeringMode([user("/pstack-off Explain this")])).toEqual({
      enabled: false,
      commandOnly: false,
    });
  });

  test("does not activate from quoted instructions, snippets, or assistant/tool text", () => {
    for (const text of [
      "What does /pstack do?",
      "```\n/pstack\n```",
      "> /pstack",
      "/pstack-other",
      "/pstack/off",
    ]) {
      expect(resolveEngineeringMode([user(text)]).enabled).toBe(false);
    }
    expect(
      resolveEngineeringMode([
        { role: "assistant", parts: [{ type: "text", text: "/pstack" }] },
        { role: "tool", parts: [{ type: "text", text: "/pstack" }] },
        { role: "user", parts: [{ type: "data-snippet", text: "/pstack" }] },
      ]),
    ).toEqual({ enabled: false, commandOnly: false });
  });

  test("acknowledges a command alone but treats accompanying text or attachments as a task", () => {
    expect(resolveEngineeringMode([user("/pstack")]).commandOnly).toBe(true);
    expect(
      resolveEngineeringMode([
        {
          role: "user",
          parts: [
            { type: "text", text: "/pstack" },
            { type: "text", text: "Review this code" },
          ],
        },
      ]),
    ).toEqual({ enabled: true, commandOnly: false });
    expect(
      resolveEngineeringMode([
        {
          role: "user",
          parts: [{ type: "text", text: "/pstack" }, { type: "file" }],
        },
      ]),
    ).toEqual({ enabled: true, commandOnly: false });
  });
});
