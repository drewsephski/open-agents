import { isToolUIPart } from "ai";
import type {
  WebAgentCommitData,
  WebAgentPrData,
  WebAgentUIMessage,
} from "@/app/types";

export type ProjectCheckCategory = "typecheck" | "lint" | "tests" | "build";
export type ProjectCheckStatus = "passed" | "failed";

export type ProjectCheckRun = {
  category: ProjectCheckCategory;
  status: ProjectCheckStatus;
  command: string;
  exitCode?: number;
};

export type ProjectCheckEvidence = ProjectCheckRun & {
  attempts: ProjectCheckRun[];
};

export type BrowserOperation =
  | "navigation"
  | "snapshot"
  | "console"
  | "interaction"
  | "viewport"
  | "screenshot";

export type BrowserEvidenceEvent = {
  operation: BrowserOperation;
  status: "observed" | "failed";
  command: string;
  detail: string;
  exitCode?: number;
};

export type BrowserEvidence = {
  status: "observed" | "failed";
  exercised: boolean;
  events: BrowserEvidenceEvent[];
  currentEvents: BrowserEvidenceEvent[];
};

export type CommitEvidence = {
  status: "observed" | "failed" | "pending" | "skipped";
  label: string;
  committed: boolean;
  pushed: boolean;
  url?: string;
};

export type PullRequestEvidence = {
  status: "observed" | "failed" | "pending" | "skipped";
  label: string;
  number?: number;
  url?: string;
};

export type PreviewEvidence = {
  status: "ready" | "building" | "failed";
  label: string;
  url?: string;
};

export type MissionEvidence = {
  anchorAssistantMessageId: string;
  checks: ProjectCheckEvidence[];
  checkRuns: ProjectCheckRun[];
  browser?: BrowserEvidence;
  delivery: {
    commit?: CommitEvidence;
    pullRequest?: PullRequestEvidence;
  };
};

const CHECK_CATEGORY_ORDER: ProjectCheckCategory[] = [
  "typecheck",
  "lint",
  "tests",
  "build",
];

const PACKAGE_MANAGER_OPTIONS_WITH_VALUES = new Set([
  "--cwd",
  "--dir",
  "--filter",
  "--prefix",
  "--workspace",
  "-C",
  "-F",
  "-w",
]);

const BROWSER_OPTIONS_WITH_VALUES = new Set([
  "--cdp",
  "--executable-path",
  "--extension",
  "--headers",
  "--provider",
  "--proxy",
  "--session",
  "-p",
]);

const SCRIPT_CATEGORIES: Record<string, ProjectCheckCategory> = {
  typecheck: "typecheck",
  lint: "lint",
  check: "lint",
  test: "tests",
  build: "build",
};

function tokenizeSimpleCommand(command: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (const character of command.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/[;&|<>\n\r]/.test(character)) {
      return null;
    }

    if (/\s/.test(character)) {
      pushCurrent();
      continue;
    }

    current += character;
  }

  if (escaped || quote) {
    return null;
  }

  pushCurrent();
  return tokens;
}

function executableName(token: string): string {
  return token.split("/").at(-1)?.toLowerCase() ?? token.toLowerCase();
}

function isEnvironmentAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function withoutEnvironmentPrefix(tokens: string[]): string[] {
  let index = 0;

  if (tokens[index] === "env") {
    index += 1;
  }

  while (tokens[index] && isEnvironmentAssignment(tokens[index])) {
    index += 1;
  }

  return tokens.slice(index);
}

function skipPackageManagerOptions(
  tokens: string[],
  startIndex: number,
): number {
  let index = startIndex;

  while (tokens[index]?.startsWith("-")) {
    const option = tokens[index];
    index += 1;
    if (option && PACKAGE_MANAGER_OPTIONS_WITH_VALUES.has(option)) {
      index += 1;
    }
  }

  return index;
}

function categoryForScript(script: string): ProjectCheckCategory | null {
  const normalized = script.toLowerCase();
  const exact = SCRIPT_CATEGORIES[normalized];
  if (exact) {
    return exact;
  }

  const [base, suffix] = normalized.split(":", 2);
  if (!suffix) {
    return null;
  }

  if (base === "test" || base === "typecheck" || base === "lint") {
    return SCRIPT_CATEGORIES[base] ?? null;
  }

  return null;
}

function classifyDirectTool(tokens: string[]): ProjectCheckCategory | null {
  const executable = executableName(tokens[0] ?? "");

  if (executable === "vitest" || executable === "jest") {
    return "tests";
  }

  if (executable === "next" && tokens[1]?.toLowerCase() === "build") {
    return "build";
  }

  if (executable === "tsc" && tokens.includes("--noEmit")) {
    return "typecheck";
  }

  if (executable === "eslint") {
    return "lint";
  }

  if (
    (executable === "biome" || executable === "ultracite") &&
    tokens[1]?.toLowerCase() === "check"
  ) {
    return "lint";
  }

  return null;
}

function classifyTurbo(tokens: string[]): ProjectCheckCategory | null {
  let index = skipPackageManagerOptions(tokens, 1);
  if (tokens[index]?.toLowerCase() === "run") {
    index += 1;
  }
  const task = tokens[index];
  return task ? categoryForScript(task) : null;
}

function classifyPackageManager(tokens: string[]): ProjectCheckCategory | null {
  const packageManager = executableName(tokens[0] ?? "");
  let index = skipPackageManagerOptions(tokens, 1);

  if (tokens[index]?.toLowerCase() === "run") {
    index += 1;
  } else if (
    (packageManager === "npm" && tokens[index]?.toLowerCase() === "exec") ||
    tokens[index]?.toLowerCase() === "exec" ||
    tokens[index]?.toLowerCase() === "x" ||
    tokens[index]?.toLowerCase() === "dlx"
  ) {
    return classifyDirectTool(tokens.slice(index + 1));
  }

  const command = tokens[index];
  if (!command) {
    return null;
  }

  return categoryForScript(command) ?? classifyDirectTool(tokens.slice(index));
}

export function classifyVerificationCommand(
  command: string,
): ProjectCheckCategory | null {
  const parsedTokens = tokenizeSimpleCommand(command);
  if (!parsedTokens || parsedTokens.length === 0) {
    return null;
  }

  const tokens = withoutEnvironmentPrefix(parsedTokens);
  const executable = executableName(tokens[0] ?? "");

  if (["pnpm", "npm", "yarn", "bun"].includes(executable)) {
    return classifyPackageManager(tokens);
  }

  if (executable === "npx" || executable === "bunx") {
    return classifyDirectTool(
      tokens.slice(skipPackageManagerOptions(tokens, 1)),
    );
  }

  if (executable === "turbo") {
    return classifyTurbo(tokens);
  }

  return classifyDirectTool(tokens);
}

function browserTargetDetail(target: string | undefined): string {
  if (!target) {
    return "Navigation succeeded";
  }

  try {
    const url = new URL(target);
    return `Opened ${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `Opened ${target}`;
  }
}

export function classifyBrowserCommand(
  command: string,
): Pick<BrowserEvidenceEvent, "operation" | "detail"> | null {
  const parsedTokens = tokenizeSimpleCommand(command);
  if (
    !parsedTokens ||
    executableName(parsedTokens[0] ?? "") !== "agent-browser"
  ) {
    return null;
  }

  let actionIndex = 1;
  while (parsedTokens[actionIndex]?.startsWith("-")) {
    const option = parsedTokens[actionIndex];
    actionIndex += 1;
    if (option && BROWSER_OPTIONS_WITH_VALUES.has(option)) {
      actionIndex += 1;
    }
  }

  const action = parsedTokens[actionIndex]?.toLowerCase();
  if (!action) {
    return null;
  }

  if (["open", "goto", "navigate"].includes(action)) {
    return {
      operation: "navigation",
      detail: browserTargetDetail(parsedTokens[actionIndex + 1]),
    };
  }

  if (action === "snapshot") {
    return { operation: "snapshot", detail: "Page snapshot inspected" };
  }

  if (action === "console" || action === "errors") {
    return {
      operation: "console",
      detail:
        action === "console"
          ? "Browser console inspected"
          : "Browser errors inspected",
    };
  }

  if (action === "screenshot") {
    return { operation: "screenshot", detail: "Screenshot captured" };
  }

  if (
    action === "viewport" ||
    action === "device" ||
    action === "emulate" ||
    (action === "set" &&
      ["viewport", "device"].includes(
        parsedTokens[actionIndex + 1]?.toLowerCase() ?? "",
      ))
  ) {
    return { operation: "viewport", detail: "Viewport changed" };
  }

  if (
    [
      "click",
      "dblclick",
      "fill",
      "type",
      "press",
      "key",
      "keydown",
      "keyup",
      "select",
      "check",
      "uncheck",
      "hover",
      "focus",
      "scroll",
      "scrollintoview",
      "scrollinto",
      "drag",
      "upload",
      "find",
    ].includes(action)
  ) {
    return { operation: "interaction", detail: "Interaction exercised" };
  }

  return null;
}

function getTerminalBashResult(part: WebAgentUIMessage["parts"][number]): {
  command: string;
  status: ProjectCheckStatus;
  exitCode?: number;
} | null {
  if (!isToolUIPart(part) || part.type !== "tool-bash") {
    return null;
  }

  const command =
    typeof part.input?.command === "string" ? part.input.command.trim() : "";
  if (!command) {
    return null;
  }

  if (part.state === "output-error") {
    return { command, status: "failed" };
  }

  if (part.state !== "output-available") {
    return null;
  }

  if (part.preliminary === true) {
    return null;
  }

  const exitCode =
    typeof part.output?.exitCode === "number"
      ? part.output.exitCode
      : undefined;
  const explicitlyFailed = part.output?.success === false;
  const explicitlyPassed =
    part.output?.success === true || (!explicitlyFailed && exitCode === 0);
  const status =
    explicitlyPassed && (exitCode === undefined || exitCode === 0)
      ? "passed"
      : "failed";

  return { command, status, ...(exitCode === undefined ? {} : { exitCode }) };
}

function deriveCommitEvidence(data: WebAgentCommitData): CommitEvidence {
  if (data.status === "pending") {
    return {
      status: "pending",
      label: "Commit pending",
      committed: false,
      pushed: false,
    };
  }

  if (data.status === "error") {
    return {
      status: "failed",
      label: "Commit failed",
      committed: false,
      pushed: false,
    };
  }

  if (data.status === "skipped") {
    return {
      status: "skipped",
      label: "Commit skipped",
      committed: false,
      pushed: false,
    };
  }

  const committed = data.committed === true;
  const pushed = data.pushed === true;
  const label =
    committed && pushed
      ? "Committed & pushed"
      : committed
        ? "Committed"
        : pushed
          ? "Pushed commits"
          : "Commit complete";

  return {
    status: "observed",
    label,
    committed,
    pushed,
    ...(data.url ? { url: data.url } : {}),
  };
}

function derivePullRequestEvidence(data: WebAgentPrData): PullRequestEvidence {
  if (data.status === "pending") {
    return { status: "pending", label: "Pull request pending" };
  }

  if (data.status === "error") {
    return { status: "failed", label: "Pull request failed" };
  }

  if (data.status === "skipped") {
    return { status: "skipped", label: "Pull request skipped" };
  }

  const label = data.prNumber
    ? data.syncedExisting
      ? `PR #${data.prNumber} synchronized`
      : `PR #${data.prNumber} opened`
    : data.requiresManualCreation
      ? "PR ready for manual creation"
      : "Pull request ready";

  return {
    status: "observed",
    label,
    ...(data.prNumber === undefined ? {} : { number: data.prNumber }),
    ...(data.url ? { url: data.url } : {}),
  };
}

export function derivePreviewEvidence(params: {
  hasLinkedProject: boolean;
  hasCurrentDelivery: boolean;
  deploymentUrl: string | null;
  buildingDeploymentUrl: string | null;
  failedDeploymentUrl: string | null;
  isDeploymentStale: boolean;
}): PreviewEvidence | undefined {
  if (!params.hasLinkedProject || !params.hasCurrentDelivery) {
    return undefined;
  }

  if (params.isDeploymentStale || params.buildingDeploymentUrl) {
    return {
      status: "building",
      label: "Preview building",
      ...(params.buildingDeploymentUrl
        ? { url: params.buildingDeploymentUrl }
        : {}),
    };
  }

  if (params.deploymentUrl) {
    return {
      status: "ready",
      label: "Preview ready",
      url: params.deploymentUrl,
    };
  }

  if (params.failedDeploymentUrl) {
    return {
      status: "failed",
      label: "Preview failed",
      url: params.failedDeploymentUrl,
    };
  }

  return undefined;
}

export function deriveMissionEvidence(
  messages: WebAgentUIMessage[],
): MissionEvidence | null {
  let latestUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserMessageIndex = index;
      break;
    }
  }

  if (latestUserMessageIndex < 0) {
    return null;
  }

  const assistantMessages = messages
    .slice(latestUserMessageIndex + 1)
    .filter((message) => message.role === "assistant");
  const anchorAssistantMessage = assistantMessages.at(-1);
  if (!anchorAssistantMessage) {
    return null;
  }

  const checkRuns: ProjectCheckRun[] = [];
  const browserEvents: BrowserEvidenceEvent[] = [];
  let commit: CommitEvidence | undefined;
  let pullRequest: PullRequestEvidence | undefined;

  for (const message of assistantMessages) {
    for (const part of message.parts) {
      const bashResult = getTerminalBashResult(part);
      if (bashResult) {
        const checkCategory = classifyVerificationCommand(bashResult.command);
        if (checkCategory) {
          checkRuns.push({ category: checkCategory, ...bashResult });
        }

        const browserCommand = classifyBrowserCommand(bashResult.command);
        if (browserCommand) {
          browserEvents.push({
            ...browserCommand,
            status: bashResult.status === "passed" ? "observed" : "failed",
            command: bashResult.command,
            ...(bashResult.exitCode === undefined
              ? {}
              : { exitCode: bashResult.exitCode }),
          });
        }
      }

      if (part.type === "data-commit") {
        commit = deriveCommitEvidence(part.data);
      } else if (part.type === "data-pr") {
        pullRequest = derivePullRequestEvidence(part.data);
      }
    }
  }

  const checks = CHECK_CATEGORY_ORDER.flatMap((category) => {
    const attempts = checkRuns.filter((run) => run.category === category);
    const current = attempts.at(-1);
    return current ? [{ ...current, attempts }] : [];
  });

  const latestBrowserEventByOperation = new Map<
    BrowserOperation,
    BrowserEvidenceEvent
  >();
  for (const event of browserEvents) {
    latestBrowserEventByOperation.set(event.operation, event);
  }
  const currentBrowserEvents = [...latestBrowserEventByOperation.values()];
  const hasBrowserFailure = currentBrowserEvents.some(
    (event) => event.status === "failed",
  );
  const successfulBrowserOperations = new Set(
    currentBrowserEvents
      .filter((event) => event.status === "observed")
      .map((event) => event.operation),
  );
  const hasMeaningfulObservation = [
    "snapshot",
    "console",
    "interaction",
    "screenshot",
  ].some((operation) =>
    successfulBrowserOperations.has(operation as BrowserOperation),
  );
  const browser =
    browserEvents.length > 0
      ? {
          status: hasBrowserFailure
            ? ("failed" as const)
            : ("observed" as const),
          exercised:
            !hasBrowserFailure &&
            successfulBrowserOperations.has("navigation") &&
            hasMeaningfulObservation,
          events: browserEvents,
          currentEvents: currentBrowserEvents,
        }
      : undefined;

  return {
    anchorAssistantMessageId: anchorAssistantMessage.id,
    checks,
    checkRuns,
    ...(browser ? { browser } : {}),
    delivery: {
      ...(commit ? { commit } : {}),
      ...(pullRequest ? { pullRequest } : {}),
    },
  };
}

export function hasMissionEvidence(evidence: MissionEvidence): boolean {
  return Boolean(
    evidence.checks.length > 0 ||
    evidence.browser ||
    evidence.delivery.commit ||
    evidence.delivery.pullRequest,
  );
}
