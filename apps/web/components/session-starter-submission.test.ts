import { describe, expect, test } from "bun:test";
import { buildSessionStarterSubmission } from "./session-starter-submission";

describe("buildSessionStarterSubmission", () => {
  test("preserves a repository task, selected Mission, and existing controls", () => {
    const vercelProject = {
      projectId: "project-1",
      projectName: "dashboard",
      teamId: "team-1",
      teamSlug: "acme",
    };

    expect(
      buildSessionStarterSubmission({
        mode: "repo",
        selectedOwner: "acme",
        selectedRepo: "dashboard",
        selectedBranch: "feature/settings",
        isNewBranch: false,
        sandboxType: "vercel",
        autoCommitPush: true,
        autoCreatePr: true,
        missionType: "fix_bug",
        initialMessage: "  The settings page crashes after deleting a key.  ",
        vercelProject,
      }),
    ).toEqual({
      repoOwner: "acme",
      repoName: "dashboard",
      branch: "feature/settings",
      cloneUrl: "https://github.com/acme/dashboard",
      isNewBranch: false,
      sandboxType: "vercel",
      autoCommitPush: true,
      autoCreatePr: true,
      missionType: "fix_bug",
      initialMessage: "The settings page crashes after deleting a key.",
      vercelProject,
    });
  });

  test("keeps generic chat on custom without repository delivery controls", () => {
    expect(
      buildSessionStarterSubmission({
        mode: "empty",
        selectedOwner: "acme",
        selectedRepo: "dashboard",
        selectedBranch: "main",
        isNewBranch: true,
        sandboxType: "vercel",
        autoCommitPush: true,
        autoCreatePr: true,
        missionType: "ship_feature",
        initialMessage: "  Explore an idea.  ",
        vercelProject: null,
      }),
    ).toEqual({
      repoOwner: undefined,
      repoName: undefined,
      branch: undefined,
      cloneUrl: undefined,
      isNewBranch: false,
      sandboxType: "vercel",
      autoCommitPush: true,
      autoCreatePr: true,
      missionType: "custom",
      initialMessage: "Explore an idea.",
      vercelProject: null,
    });
  });
});
