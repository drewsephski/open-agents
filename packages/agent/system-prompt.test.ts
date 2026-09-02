import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt Mission guidance", () => {
  test("places Mission guidance between the core prompt and project instructions", () => {
    const prompt = buildSystemPrompt({
      missionInstructions: "# Mission: Ship a feature\n\nVerify the feature.",
      customInstructions: "Follow AGENTS.md.",
    });

    const coreIndex = prompt.indexOf("# Role & Agency");
    const missionIndex = prompt.indexOf("# Mission: Ship a feature");
    const projectIndex = prompt.indexOf("# Project-Specific Instructions");

    expect(coreIndex).toBeGreaterThanOrEqual(0);
    expect(missionIndex).toBeGreaterThan(coreIndex);
    expect(projectIndex).toBeGreaterThan(missionIndex);
  });

  test("does not add a Mission section when no guidance is provided", () => {
    const prompt = buildSystemPrompt({});

    expect(prompt).not.toContain("# Mission:");
  });
});
