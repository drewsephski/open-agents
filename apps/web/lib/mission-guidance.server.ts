import "server-only";

import type { MissionType } from "./missions";

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

const MISSION_INSTRUCTIONS = {
  ship_feature: SHIP_FEATURE_INSTRUCTIONS,
  fix_bug: `# Mission: Fix a bug

Reproduce the reported problem, identify its root cause, make the smallest durable fix, and add or run regression verification. Report the reproduction and verification evidence you actually observed.`,
  fix_build: `# Mission: Fix the build

Run the repository's canonical failing checks first, fix root causes instead of suppressing failures, and rerun the affected checks until clean. Keep pre-existing or environmental failures distinct from failures caused by your changes.`,
  upgrade_nextjs: `# Mission: Upgrade Next.js

Inspect the current Next.js and related React versions, configuration, router usage, package manager, and official migration requirements. Upgrade conservatively, preserve project conventions, resolve resulting issues, run the repository's verification, and browser-check affected behavior when relevant.`,
  audit_app: `# Mission: Audit the app

Analyze the requested area without making surprise edits. Return prioritized, actionable findings with file or runtime evidence, explain material impact, and distinguish confirmed issues from hypotheses or unverified risks.`,
  custom: "",
} as const satisfies Record<MissionType, string>;

export function getMissionInstructions(missionType: MissionType): string {
  return MISSION_INSTRUCTIONS[missionType];
}
