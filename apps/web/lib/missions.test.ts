import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CHAT_MISSION_TYPE,
  DEFAULT_REPOSITORY_MISSION_TYPE,
  MISSION_DEFINITIONS,
  MISSION_TYPE_VALUES,
  getMissionInstructions,
  isMissionType,
  normalizeMissionType,
  resolveNewSessionMissionType,
} from "./missions";

describe("Mission domain", () => {
  test("accepts every supported Mission type", () => {
    expect(MISSION_TYPE_VALUES).toEqual([
      "ship_feature",
      "fix_bug",
      "fix_build",
      "upgrade_nextjs",
      "audit_app",
      "custom",
    ]);
    expect(MISSION_TYPE_VALUES.every(isMissionType)).toBe(true);
    expect(MISSION_DEFINITIONS.map((mission) => mission.id)).toEqual([
      ...MISSION_TYPE_VALUES,
    ]);
  });

  test("rejects unsupported Mission values", () => {
    expect(isMissionType("deploy_everything")).toBe(false);
    expect(isMissionType(42)).toBe(false);
    expect(isMissionType(null)).toBe(false);
  });

  test("falls back to custom for missing or legacy values", () => {
    expect(DEFAULT_CHAT_MISSION_TYPE).toBe("custom");
    expect(normalizeMissionType(undefined)).toBe("custom");
    expect(normalizeMissionType("unknown")).toBe("custom");
  });

  test("defaults repository sessions to Ship a feature and chats to custom", () => {
    expect(DEFAULT_REPOSITORY_MISSION_TYPE).toBe("ship_feature");
    expect(
      resolveNewSessionMissionType({
        hasRepository: true,
        missionType: undefined,
      }),
    ).toBe("ship_feature");
    expect(
      resolveNewSessionMissionType({
        hasRepository: false,
        missionType: "ship_feature",
      }),
    ).toBe("custom");
  });

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
