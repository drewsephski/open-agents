"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGitHubConnectionStatus } from "@/hooks/use-github-connection-status";
import { useSession } from "@/hooks/use-session";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useVercelRepoProjects } from "@/hooks/use-vercel-repo-projects";
import type { VercelProjectSelection } from "@/lib/vercel/types";
import { cn } from "@/lib/utils";
import { BranchSelectorCompact } from "./branch-selector-compact";
import { RepoSelectorCompact } from "./repo-selector-compact";
import {
  DEFAULT_SANDBOX_TYPE,
  SANDBOX_OPTIONS,
  type SandboxType,
} from "./sandbox-selector-compact";
import { SessionStarterVercelSyncSection } from "./session-starter-vercel-sync-section";
import {
  SlidingTabIndicator,
  slidingTabProps,
  useSlidingTabBox,
} from "./ui/sliding-tab-indicator";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";

type SessionMode = "empty" | "repo";

interface SessionStarterProps {
  onSubmit: (session: {
    repoOwner?: string;
    repoName?: string;
    branch?: string;
    cloneUrl?: string;
    isNewBranch: boolean;
    sandboxType: SandboxType;
    autoCommitPush: boolean;
    autoCreatePr: boolean;
    initialMessage?: string;
    vercelProject?: VercelProjectSelection | null;
  }) => void;
  isLoading?: boolean;
  lastRepo: { owner: string; repo: string } | null;
}

export function SessionStarter({
  onSubmit,
  isLoading,
  lastRepo,
}: SessionStarterProps) {
  const [mode, setMode] = useState<SessionMode>(() =>
    lastRepo ? "repo" : "empty",
  );
  const [selectedOwner, setSelectedOwner] = useState(
    () => lastRepo?.owner ?? "",
  );
  const [selectedRepo, setSelectedRepo] = useState(() => lastRepo?.repo ?? "");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [isNewBranch, setIsNewBranch] = useState(!!lastRepo);
  const [vercelProjectChoice, setVercelProjectChoice] = useState<
    string | null | undefined
  >(undefined);

  const {
    session,
    loading: sessionLoading,
    hasGitHub,
    hasVercelAccount,
  } = useSession();
  const isTrialUser = session?.isManagedTemplateTrialUser ?? false;
  const { reconnectRequired, isLoading: githubConnectionLoading } =
    useGitHubConnectionStatus({
      enabled: hasGitHub,
    });
  const { preferences, loading: preferencesLoading } = useUserPreferences();
  const defaultAutoCommitPush = preferences?.autoCommitPush ?? false;
  const defaultAutoCreatePr = preferences?.autoCreatePr ?? false;
  const [autoCommitPush, setAutoCommitPush] = useState<boolean | null>(null);
  const [autoCreatePr, setAutoCreatePr] = useState<boolean | null>(null);
  const [gitSettingsExpanded, setGitSettingsExpanded] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const modeTabsRef = useRef<HTMLDivElement>(null);
  const activeModeTabBox = useSlidingTabBox(modeTabsRef, mode);
  const sandboxType = preferences?.defaultSandboxType ?? DEFAULT_SANDBOX_TYPE;
  const sandboxName =
    SANDBOX_OPTIONS.find((s) => s.id === sandboxType)?.name ?? sandboxType;
  const isRepoModeDisabled = sessionLoading || isTrialUser;

  const shouldLoadVercelProjects =
    mode === "repo" &&
    !isTrialUser &&
    !githubConnectionLoading &&
    !reconnectRequired &&
    !!selectedOwner &&
    !!selectedRepo &&
    hasVercelAccount;
  const {
    data: repoProjects,
    loading: repoProjectsLoading,
    error: repoProjectsError,
  } = useVercelRepoProjects({
    enabled: shouldLoadVercelProjects,
    repoOwner: selectedOwner,
    repoName: selectedRepo,
  });

  useEffect(() => {
    if (!isTrialUser || mode === "empty") return;

    setMode("empty");
    setSelectedOwner("");
    setSelectedRepo("");
    setSelectedBranch(null);
    setIsNewBranch(false);
    setVercelProjectChoice(undefined);
    setGitSettingsExpanded(false);
  }, [isTrialUser, mode]);

  useEffect(() => {
    if (!shouldLoadVercelProjects) {
      setVercelProjectChoice(undefined);
      return;
    }
    if (!repoProjects || repoProjectsLoading) return;
    if (repoProjects.selectedProjectId) {
      setVercelProjectChoice(repoProjects.selectedProjectId);
      return;
    }
    if (repoProjects.projects.length === 0) {
      setVercelProjectChoice(null);
      return;
    }
    setVercelProjectChoice(undefined);
  }, [repoProjects, repoProjectsLoading, shouldLoadVercelProjects]);

  const handleRepoSelect = (owner: string, repo: string) => {
    setSelectedOwner(owner);
    setSelectedRepo(repo);
    setSelectedBranch(null);
    setIsNewBranch(false);
    setVercelProjectChoice(undefined);
  };

  const handleRepoClear = () => {
    setSelectedOwner("");
    setSelectedRepo("");
    setSelectedBranch(null);
    setIsNewBranch(false);
    setVercelProjectChoice(undefined);
  };

  const handleBranchChange = (branch: string | null, newBranch: boolean) => {
    setSelectedBranch(branch);
    setIsNewBranch(newBranch);
  };

  const handleModeChange = (newMode: SessionMode) => {
    if (isRepoModeDisabled && newMode === "repo") return;

    setMode(newMode);
    if (newMode === "empty") handleRepoClear();
  };

  const isRepoSelectionComplete =
    mode !== "repo" || (selectedOwner && selectedRepo);
  const isVercelLookupPending =
    mode === "repo" &&
    !!selectedOwner &&
    !!selectedRepo &&
    (sessionLoading || (shouldLoadVercelProjects && repoProjectsLoading));
  const requiresVercelChoice =
    shouldLoadVercelProjects &&
    !repoProjectsLoading &&
    !repoProjectsError &&
    !!repoProjects &&
    repoProjects.projects.length > 0 &&
    repoProjects.selectedProjectId === null &&
    vercelProjectChoice === undefined;
  const controlsDisabled = isLoading || preferencesLoading;
  const isSubmitDisabled =
    controlsDisabled ||
    (isRepoModeDisabled && mode === "repo") ||
    (mode === "repo" && (githubConnectionLoading || reconnectRequired)) ||
    !isRepoSelectionComplete ||
    isVercelLookupPending ||
    requiresVercelChoice;
  const effectiveAutoCommitPush = autoCommitPush ?? defaultAutoCommitPush;
  const effectiveAutoCreatePr = autoCreatePr ?? defaultAutoCreatePr;
  const showVercelProjectSection =
    mode === "repo" &&
    !isTrialUser &&
    !githubConnectionLoading &&
    !reconnectRequired &&
    !!selectedOwner &&
    !!selectedRepo &&
    (sessionLoading || hasVercelAccount);

  const handleSubmit = () => {
    if (isSubmitDisabled) return;

    let vercelProject: VercelProjectSelection | null | undefined;
    if (shouldLoadVercelProjects) {
      if (repoProjectsError || !repoProjects) {
        vercelProject = undefined;
      } else if (vercelProjectChoice === null) {
        vercelProject = null;
      } else if (typeof vercelProjectChoice === "string") {
        vercelProject =
          repoProjects.projects.find(
            (project) => project.projectId === vercelProjectChoice,
          ) ?? null;
      } else {
        return;
      }
    }

    onSubmit({
      repoOwner: mode === "repo" ? selectedOwner || undefined : undefined,
      repoName: mode === "repo" ? selectedRepo || undefined : undefined,
      branch: mode === "repo" ? selectedBranch || undefined : undefined,
      cloneUrl:
        mode === "repo" && selectedOwner && selectedRepo
          ? `https://github.com/${selectedOwner}/${selectedRepo}`
          : undefined,
      isNewBranch: mode === "repo" ? isNewBranch : false,
      sandboxType,
      autoCommitPush: effectiveAutoCommitPush,
      autoCreatePr: effectiveAutoCommitPush ? effectiveAutoCreatePr : false,
      initialMessage: mode === "empty" ? initialMessage.trim() : undefined,
      vercelProject,
    });
  };

  const buttonLabel =
    mode === "repo" && selectedOwner && selectedRepo
      ? `Start with ${selectedOwner}/${selectedRepo}`
      : "Start session";

  return (
    <div className="h-[30rem] w-full min-w-0 max-w-2xl overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(40,32,20,0.04),0_12px_32px_rgba(40,32,20,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_16px_40px_rgba(0,0,0,0.4)] sm:p-5">
      <div className="flex h-full flex-col gap-4">
        <div
          ref={modeTabsRef}
          role="tablist"
          aria-label="Session type"
          className="relative flex rounded-lg bg-muted p-1"
        >
          <SlidingTabIndicator box={activeModeTabBox} variant="pill" />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "empty"}
            onClick={() => handleModeChange("empty")}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-500 ease-out",
              mode === "empty"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            {...slidingTabProps(mode === "empty")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "repo"}
            onClick={() => handleModeChange("repo")}
            disabled={isRepoModeDisabled}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-500 ease-out",
              isRepoModeDisabled
                ? "cursor-not-allowed text-muted-foreground/50"
                : mode === "repo"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
            {...slidingTabProps(mode === "repo")}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Repository
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-y-auto">
          {mode === "repo" && (
            <div className="flex flex-col gap-3">
              <RepoSelectorCompact
                selectedOwner={selectedOwner}
                selectedRepo={selectedRepo}
                onSelect={handleRepoSelect}
              />
              {selectedOwner &&
                selectedRepo &&
                !githubConnectionLoading &&
                !reconnectRequired && (
                  <BranchSelectorCompact
                    owner={selectedOwner}
                    repo={selectedRepo}
                    value={selectedBranch}
                    isNewBranch={isNewBranch}
                    onChange={handleBranchChange}
                  />
                )}

              {showVercelProjectSection && (
                <SessionStarterVercelSyncSection
                  controlsDisabled={controlsDisabled}
                  isVercelLookupPending={isVercelLookupPending}
                  repoProjects={repoProjects}
                  repoProjectsError={repoProjectsError}
                  requiresVercelChoice={requiresVercelChoice}
                  vercelProjectChoice={vercelProjectChoice}
                  onVercelProjectChoiceChange={setVercelProjectChoice}
                />
              )}
            </div>
          )}

          {mode === "empty" && (
            <div className="flex h-full flex-col gap-3">
              <label
                htmlFor="initial-session-message"
                className="text-sm font-medium text-foreground"
              >
                What would you like to work on?
              </label>
              <Textarea
                id="initial-session-message"
                value={initialMessage}
                onChange={(event) => setInitialMessage(event.target.value)}
                placeholder="Describe what you want the agent to build, fix, or explore…"
                disabled={controlsDisabled}
                className="min-h-0 flex-1 resize-none bg-background/50 p-4 leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                {isTrialUser
                  ? "Start a chat without connecting GitHub."
                  : "This message will be sent as soon as the session starts."}
              </p>
            </div>
          )}

          {mode === "repo" && !gitSettingsExpanded && (
            <button
              type="button"
              onClick={() => setGitSettingsExpanded(true)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {effectiveAutoCommitPush ? (
                  <>
                    Auto commit{" "}
                    <span className="font-medium text-foreground/80">on</span>
                    {effectiveAutoCreatePr && (
                      <>
                        {" · "}Auto PR{" "}
                        <span className="font-medium text-foreground/80">
                          on
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  "Auto commit and push disabled"
                )}
              </span>
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </button>
          )}

          {mode === "repo" && gitSettingsExpanded && (
            <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
              <button
                type="button"
                onClick={() => setGitSettingsExpanded(false)}
                className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left transition-colors hover:bg-muted/30"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">Auto commit and push</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically commit and push after each agent turn.
                  </p>
                </div>
                <ChevronUpIcon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </button>
              <div className="border-t border-border">
                <div className="flex items-center justify-between gap-4 px-3 py-2">
                  <p className="text-sm font-medium">Commit and push</p>
                  <Switch
                    checked={effectiveAutoCommitPush}
                    onCheckedChange={setAutoCommitPush}
                    disabled={controlsDisabled}
                  />
                </div>
                {effectiveAutoCommitPush && (
                  <div className="flex items-center justify-between gap-4 border-t border-border px-3 py-2 pl-6">
                    <p className="text-sm text-muted-foreground">
                      Create pull request
                    </p>
                    <Switch
                      checked={effectiveAutoCreatePr}
                      onCheckedChange={setAutoCreatePr}
                      disabled={controlsDisabled}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            isSubmitDisabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? "Creating session…" : buttonLabel}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Using {sandboxName} sandbox{" "}
          <span className="text-muted-foreground/60">&middot;</span>{" "}
          <Link
            href="/settings/preferences"
            className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/40"
          >
            Change
          </Link>
        </p>
      </div>
    </div>
  );
}
