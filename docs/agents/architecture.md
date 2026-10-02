# Architecture

This is a Turborepo monorepo for Launchstack, a cloud coding-agent platform built on the open-source Open Agents architecture from Vercel Labs.

## Core Flow

```
Web -> Agent (packages/agent) -> Sandbox (packages/sandbox)
```

1. **Web** handles authentication, session management, and the primary user interface
2. **Agent** (`deepAgent`) is a `ToolLoopAgent` with tools for file ops, bash, and task delegation
3. **Sandbox** abstracts file system and shell operations for cloud execution backends

Authenticated external actions form a separate server-side control-plane path:
Web workflow steps → Action Provider → Composio → Gmail. They share the agent's
AI SDK tool/approval flow but never execute in the coding sandbox. See
[Action Providers](action-providers.md) for session persistence, approval, and
retry behavior.

## Key Packages

- **packages/agent/** - Core agent implementation with tools, subagents, and context management
- **packages/sandbox/** - Execution environment abstraction for cloud sandboxes
- **packages/shared/** - Shared utilities across packages

## Subagent Pattern

The `task` tool delegates to specialized subagents:
- **explorer**: Read-only, for codebase research (grep, glob, read, safe bash)
- **executor**: Full access, for implementation tasks (all tools)

## Workspace Structure

```
apps/
  web/           # Web interface
packages/
  agent/         # Core agent logic (@open-agents/agent)
  sandbox/       # Sandbox abstraction (@open-agents/sandbox)
  shared/        # Shared utilities (@open-agents/shared)
  tsconfig/      # Shared TypeScript configs
```
