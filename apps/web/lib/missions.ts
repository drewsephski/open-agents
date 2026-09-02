import { z } from "zod";

export const MISSION_TYPE_VALUES = [
  "ship_feature",
  "fix_bug",
  "fix_build",
  "upgrade_nextjs",
  "audit_app",
  "custom",
] as const;

export const missionTypeSchema = z.enum(MISSION_TYPE_VALUES);
export type MissionType = z.infer<typeof missionTypeSchema>;

export interface MissionDefinition {
  id: MissionType;
  label: string;
  description: string;
  placeholder: string;
}

export const MISSION_DEFINITIONS = [
  {
    id: "ship_feature",
    label: "Ship a feature",
    description: "Implement a feature end-to-end and verify it.",
    placeholder: "Add organization switching to the dashboard.",
  },
  {
    id: "fix_bug",
    label: "Fix a bug",
    description: "Find the root cause, fix it, and verify the regression.",
    placeholder: "The settings page crashes after deleting an API key.",
  },
  {
    id: "fix_build",
    label: "Fix the build",
    description: "Reproduce failing project checks and repair them.",
    placeholder:
      "Production builds started failing after the last dependency update.",
  },
  {
    id: "upgrade_nextjs",
    label: "Upgrade Next.js",
    description: "Upgrade carefully and resolve resulting issues.",
    placeholder: "Upgrade this app to the current supported Next.js release.",
  },
  {
    id: "audit_app",
    label: "Audit the app",
    description: "Return prioritized findings with supporting evidence.",
    placeholder:
      "Audit the dashboard for reliability, accessibility, and performance risks.",
  },
  {
    id: "custom",
    label: "Custom task",
    description: "Use your instructions without a specialized workflow.",
    placeholder: "Describe what you want the agent to build, fix, or explore…",
  },
] as const satisfies readonly MissionDefinition[];

export const DEFAULT_REPOSITORY_MISSION_TYPE: MissionType = "ship_feature";
export const DEFAULT_CHAT_MISSION_TYPE: MissionType = "custom";

const MISSION_DEFINITION_BY_TYPE = new Map(
  MISSION_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function isMissionType(value: unknown): value is MissionType {
  return missionTypeSchema.safeParse(value).success;
}

export function normalizeMissionType(value: unknown): MissionType {
  return isMissionType(value) ? value : DEFAULT_CHAT_MISSION_TYPE;
}

export function resolveNewSessionMissionType(params: {
  hasRepository: boolean;
  missionType: MissionType | undefined;
}): MissionType {
  if (!params.hasRepository) {
    return DEFAULT_CHAT_MISSION_TYPE;
  }

  return params.missionType ?? DEFAULT_REPOSITORY_MISSION_TYPE;
}

export function getMissionDefinition(
  missionType: MissionType,
): MissionDefinition {
  const definition = MISSION_DEFINITION_BY_TYPE.get(missionType);
  if (!definition) {
    throw new Error(`Missing Mission definition for ${missionType}`);
  }
  return definition;
}
