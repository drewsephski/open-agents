import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { getMissionInstructions } = await import("./mission-guidance.server");

describe("Mission server guidance", () => {
  test("provides deep Ship Feature guidance without applying it to custom", () => {
    const shipFeature = getMissionInstructions("ship_feature");

    expect(shipFeature).toContain("# Mission: Ship a feature");
    expect(shipFeature).toContain("package.json");
    expect(shipFeature).toContain("App Router");
    expect(shipFeature).toContain("agent-browser");
    expect(shipFeature).toContain("### Verified");
    expect(getMissionInstructions("custom")).toBe("");
  });

  test("provides lightweight guidance for every other specialized Mission", () => {
    const expectedGuidance = [
      ["fix_bug", "Reproduce the reported problem"],
      ["fix_build", "canonical failing checks"],
      ["upgrade_nextjs", "official migration requirements"],
      ["audit_app", "without making surprise edits"],
    ] as const;

    for (const [missionType, expectedText] of expectedGuidance) {
      expect(getMissionInstructions(missionType)).toContain(expectedText);
    }
  });
});
