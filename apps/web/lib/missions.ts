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
  instructions: string;
}

const SHIP_FEATURE_INSTRUCTIONS = `# Mission: Ship a feature

Implement the requested feature end to end and finish with verified evidence.

## Workflow

1. Read the repository's instructions before editing.
2. Inspect enough of the existing architecture and nearby call sites to understand the feature's dependencies and side effects.
3. State a brief implementation plan, then make the smallest appropriate implementation using existing conventions.
4. Run the repository's canonical scripts and relevant focused tests. Fix failures caused by your work and rerun those checks.
5. Verify user-facing behavior when the feature affects it. Finish with evidence from checks you actually performed.

## Next.js specialization

Determine whether the repository uses Next.js from its contents, especially package.json. If it does, inspect the Next.js version, package manager, available scripts, repository instructions such as AGENTS.md, App Router versus Pages Router where relevant, route and layout organization, Server and Client Component boundaries, project conventions, tests, and any authentication, database, or UI architecture involved in the task. Reuse what the repository already uses; do not assume a particular provider, ORM, component library, test runner, or hosting setup.

For user-facing web changes, use the existing agent-browser skill when the app can reasonably be run. Start the app with its project script, open the affected route, exercise the changed behavior, inspect browser console output for runtime or hydration errors, and test a representative narrow viewport when responsiveness is relevant. Capture a screenshot only when it adds useful evidence. Skip browser work for backend-only changes. If browser verification cannot be performed, say why.

## Completion response

Use these concise sections when they apply:

### Implemented

Describe the material changes.

### Verified

List only checks actually run and their outcomes.

### Delivery

Report PR or preview state only when it is known from the available environment.

### Remaining

List only genuine limitations or unverified behavior. Never claim tests, browser behavior, preview health, or deployment success without evidence.`;

export const MISSION_DEFINITIONS = [
  {
    id: "ship_feature",
    label: "Ship a feature",
    description: "Implement a feature end-to-end and verify it.",
    placeholder: "Add organization switching to the dashboard.",
    instructions: SHIP_FEATURE_INSTRUCTIONS,
  },
  {
    id: "fix_bug",
    label: "Fix a bug",
    description: "Find the root cause, fix it, and verify the regression.",
    placeholder: "The settings page crashes after deleting an API key.",
    instructions: `# Mission: Fix a bug

Reproduce the reported problem, identify its root cause, make the smallest durable fix, and add or run regression verification. Report the reproduction and verification evidence you actually observed.`,
  },
  {
    id: "fix_build",
    label: "Fix the build",
    description: "Reproduce failing project checks and repair them.",
    placeholder:
      "Production builds started failing after the last dependency update.",
    instructions: `# Mission: Fix the build

Run the repository's canonical failing checks first, fix root causes instead of suppressing failures, and rerun the affected checks until clean. Keep pre-existing or environmental failures distinct from failures caused by your changes.`,
  },
  {
    id: "upgrade_nextjs",
    label: "Upgrade Next.js",
    description: "Upgrade carefully and resolve resulting issues.",
    placeholder: "Upgrade this app to the current supported Next.js release.",
    instructions: `# Mission: Upgrade Next.js

Inspect the current Next.js and related React versions, configuration, router usage, package manager, and official migration requirements. Upgrade conservatively, preserve project conventions, resolve resulting issues, run the repository's verification, and browser-check affected behavior when relevant.`,
  },
  {
    id: "audit_app",
    label: "Audit the app",
    description: "Return prioritized findings with supporting evidence.",
    placeholder:
      "Audit the dashboard for reliability, accessibility, and performance risks.",
    instructions: `# Mission: Audit the app

Analyze the requested area without making surprise edits. Return prioritized, actionable findings with file or runtime evidence, explain material impact, and distinguish confirmed issues from hypotheses or unverified risks.`,
  },
  {
    id: "custom",
    label: "Custom task",
    description: "Use your instructions without a specialized workflow.",
    placeholder: "Describe what you want the agent to build, fix, or explore…",
    instructions: "",
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

export function getMissionInstructions(missionType: MissionType): string {
  return getMissionDefinition(missionType).instructions;
}
