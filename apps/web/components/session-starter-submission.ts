import type { SandboxType } from "@/components/sandbox-selector-compact";
import { DEFAULT_CHAT_MISSION_TYPE, type MissionType } from "@/lib/missions";
import type { VercelProjectSelection } from "@/lib/vercel/types";

export type SessionStarterMode = "empty" | "repo";

export interface SessionStarterSubmitInput {
  repoOwner?: string;
  repoName?: string;
  branch?: string;
  cloneUrl?: string;
  isNewBranch: boolean;
  sandboxType: SandboxType;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
  missionType: MissionType;
  initialMessage?: string;
  vercelProject?: VercelProjectSelection | null;
}

interface BuildSessionStarterSubmissionInput {
  mode: SessionStarterMode;
  selectedOwner: string;
  selectedRepo: string;
  selectedBranch: string | null;
  isNewBranch: boolean;
  sandboxType: SandboxType;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
  missionType: MissionType;
  initialMessage: string;
  vercelProject: VercelProjectSelection | null | undefined;
}

export function buildSessionStarterSubmission(
  input: BuildSessionStarterSubmissionInput,
): SessionStarterSubmitInput {
  const hasRepository =
    input.mode === "repo" && Boolean(input.selectedOwner && input.selectedRepo);

  return {
    repoOwner: hasRepository ? input.selectedOwner : undefined,
    repoName: hasRepository ? input.selectedRepo : undefined,
    branch: hasRepository ? input.selectedBranch || undefined : undefined,
    cloneUrl: hasRepository
      ? `https://github.com/${input.selectedOwner}/${input.selectedRepo}`
      : undefined,
    isNewBranch: hasRepository ? input.isNewBranch : false,
    sandboxType: input.sandboxType,
    autoCommitPush: input.autoCommitPush,
    autoCreatePr: input.autoCommitPush ? input.autoCreatePr : false,
    missionType: hasRepository ? input.missionType : DEFAULT_CHAT_MISSION_TYPE,
    initialMessage: input.initialMessage.trim(),
    vercelProject: input.vercelProject,
  };
}
