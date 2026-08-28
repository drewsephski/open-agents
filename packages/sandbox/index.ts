// interface
export type {
  ExecResult,
  Sandbox,
  SandboxHook,
  SandboxHooks,
  SandboxStats,
  SandboxType,
  SandboxSnapshot,
  SnapshotResult,
} from "./interface.ts";

// shared types
export type { Source, FileEntry, SandboxStatus } from "./types.ts";

// factory
export {
  connectSandbox,
  type SandboxState,
  type ConnectOptions,
  type SandboxConnectConfig,
  provisionSandbox,
  type SandboxProvisionRequest,
  type SandboxProvisionResult,
  type SandboxProviderOptions,
} from "./factory.ts";

export {
  SandboxProviderError,
  isSandboxProviderError,
  type SandboxErrorClass,
  type SandboxProvider,
} from "./errors.ts";
export type {
  SandboxCircuitBreaker,
  SandboxProviderCircuitState,
  SandboxSelectionReason,
  SandboxTelemetry,
  SandboxTelemetryEvent,
} from "./provider.ts";

// git helpers
export {
  hasUncommittedChanges,
  stageAll,
  getCurrentBranch,
  getHeadSha,
  getStagedDiff,
  getChangedFiles,
  detectBinaryFiles,
  readFileContents,
  getFileModes,
  syncToRemote,
  syncToRemotePreservingChanges,
  withTemporaryGitHubAuth,
  type FileChange,
  type FileChangeStatus,
  type FileWithContent,
} from "./git.ts";

// vercel
export {
  connectVercelSandbox,
  VercelSandbox,
  type VercelSandboxConfig,
  type VercelSandboxConnectConfig,
  type VercelState,
} from "./vercel/index.ts";

export {
  CodeSandboxSandbox,
  classifyCodeSandboxError,
  type CodeSandboxCredentials,
  type CodeSandboxState,
} from "./codesandbox/index.ts";
