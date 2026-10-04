import { describe, expect, test } from "bun:test";
import {
  extractPromptInvocation,
  formatPromptInvocation,
  parseLeadingInvocation,
} from "./prompt-invocations";

const cases = ["/help", "$review", "  $my-skill"];
describe("leading prompt invocations", () => {
  test("keeps command and skill namespaces separate and accepts leading whitespace", () => {
    expect(extractPromptInvocation("/", 1)).toEqual({
      kind: "command",
      prefix: "/",
      start: 0,
      query: "",
    });
    expect(extractPromptInvocation("$", 1)).toEqual({
      kind: "skill",
      prefix: "$",
      start: 0,
      query: "",
    });
    for (const text of cases)
      expect(extractPromptInvocation(text, text.length)).not.toBeNull();
    expect(parseLeadingInvocation("  $REVIEW checkout\nwith evidence")).toEqual(
      { kind: "skill", name: "review", args: "checkout\nwith evidence" },
    );
    expect(parseLeadingInvocation("/review checkout")).toEqual({
      kind: "command",
      name: "review",
      args: "checkout",
    });
  });
  test("round-trips skill names with spaces and quotes without confusing examples", () => {
    for (const name of ["Poteto Mode", 'Review "checkout"', "review"]) {
      const formatted = formatPromptInvocation(name, "$");
      expect(parseLeadingInvocation(`${formatted} inspect`)).toEqual({
        kind: "skill",
        name: name.toLowerCase(),
        args: "inspect",
      });
    }
    expect(formatPromptInvocation("review", "/")).toBe("/review");
    expect(parseLeadingInvocation('$""')).toBeNull();
    expect(parseLeadingInvocation('$"unfinished')).toBeNull();
  });
  test("ignores quoted examples, currency, shell substitutions, URLs, paths and inline mentions", () => {
    for (const text of [
      "$100",
      "$(pwd)",
      "https://example.com/help",
      "/workspace/file.ts",
      "Explain $review",
      "What is /plan",
      "> $review",
      "`$review`",
      "```\n/plan\n```",
      "\\$review",
    ]) {
      expect(parseLeadingInvocation(text)).toBeNull();
      expect(extractPromptInvocation(text, text.length)).toBeNull();
    }
  });
  test("completion only reads the token before the cursor and stops after arguments", () => {
    expect(extractPromptInvocation("$rev checkout", 4)?.query).toBe("rev");
    expect(extractPromptInvocation("$review checkout", 16)).toBeNull();
    expect(parseLeadingInvocation("$reviewing")).toEqual({
      kind: "skill",
      name: "reviewing",
      args: "",
    });
  });
});
