import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { MissionEvidence } from "@/lib/mission-evidence";
import { MissionEvidenceCard } from "./mission-evidence-card";

function evidence(overrides: Partial<MissionEvidence> = {}): MissionEvidence {
  return {
    anchorAssistantMessageId: "assistant-1",
    checks: [],
    checkRuns: [],
    delivery: {},
    ...overrides,
  };
}

describe("MissionEvidenceCard", () => {
  test("shows deterministic evidence for a completed repository Mission", () => {
    const typecheckRun = {
      category: "typecheck" as const,
      status: "passed" as const,
      command: "pnpm typecheck",
      exitCode: 0,
    };
    const buildRun = {
      category: "build" as const,
      status: "failed" as const,
      command: "pnpm build",
      exitCode: 1,
    };

    const html = renderToStaticMarkup(
      <MissionEvidenceCard
        missionType="ship_feature"
        evidence={evidence({
          checks: [
            { ...typecheckRun, attempts: [typecheckRun] },
            { ...buildRun, attempts: [buildRun] },
          ],
          checkRuns: [typecheckRun, buildRun],
          delivery: {
            pullRequest: {
              status: "observed",
              label: "PR #42 opened",
              number: 42,
              url: "https://github.com/acme/app/pull/42",
            },
          },
        })}
        preview={{
          status: "ready",
          label: "Preview ready",
          url: "https://preview.example.com",
        }}
      />,
    );

    expect(html).toContain("Mission evidence");
    expect(html).toContain("Typecheck");
    expect(html).toContain("Passed");
    expect(html).toContain("Production build");
    expect(html).toContain("Failed");
    expect(html).toContain("PR #42 opened");
    expect(html).toContain("Preview ready");
    expect(html).toContain('rel="noreferrer"');
  });

  test("does not add Mission evidence UI to custom chat", () => {
    const html = renderToStaticMarkup(
      <MissionEvidenceCard
        missionType="custom"
        evidence={evidence({
          checks: [
            {
              category: "tests",
              status: "passed",
              command: "pnpm test",
              exitCode: 0,
              attempts: [],
            },
          ],
        })}
      />,
    );

    expect(html).toBe("");
  });

  test("does not render unobserved checks as failures", () => {
    const typecheckRun = {
      category: "typecheck" as const,
      status: "passed" as const,
      command: "pnpm typecheck",
      exitCode: 0,
    };
    const html = renderToStaticMarkup(
      <MissionEvidenceCard
        missionType="fix_bug"
        evidence={evidence({
          checks: [{ ...typecheckRun, attempts: [typecheckRun] }],
          checkRuns: [typecheckRun],
        })}
      />,
    );

    expect(html).toContain("Typecheck");
    expect(html).not.toContain("Tests");
    expect(html).not.toContain("Production build");
  });

  test("shows the subtle empty state only for Ship a feature", () => {
    const shipFeatureHtml = renderToStaticMarkup(
      <MissionEvidenceCard missionType="ship_feature" evidence={evidence()} />,
    );
    const auditHtml = renderToStaticMarkup(
      <MissionEvidenceCard missionType="audit_app" evidence={evidence()} />,
    );

    expect(shipFeatureHtml).toContain(
      "No verification evidence captured for this Mission.",
    );
    expect(auditHtml).toBe("");
  });

  test("stays hidden while the current assistant run is streaming", () => {
    const html = renderToStaticMarkup(
      <MissionEvidenceCard
        missionType="ship_feature"
        evidence={evidence()}
        isStreaming
      />,
    );

    expect(html).toBe("");
  });
});
