import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CHAT_MISSION_TYPE,
  DEFAULT_REPOSITORY_MISSION_TYPE,
  MISSION_DEFINITIONS,
  MISSION_TYPE_VALUES,
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
    expect(
      MISSION_DEFINITIONS.every((mission) => !("instructions" in mission)),
    ).toBe(true);
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
});
