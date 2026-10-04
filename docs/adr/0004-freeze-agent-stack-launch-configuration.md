# Freeze Agent Stack launch configuration

A Stack is a user-owned reusable worker configuration. Edits publish append-only
versions. A Session references the selected version and stores the resolved
effective snapshot after explicit launch overrides. Database triggers protect
both version content and Session snapshot identity. Publishing uses optimistic
concurrency to avoid silently overwriting another edit.

Repository, branch, task, and Vercel project remain Session/run attributes.
Connections, credentials, billing, and sandbox allowance remain current server
authorization state. Stack capabilities restrict the server action registry;
they cannot add tools or weaken approval policy.

The built-in default snapshots today's preference-based behavior on new launches.
Legacy Sessions are not backfilled. Chats keep their fixed execution backends as
required by ADR 0003, with new Chats inheriting their Session's Stack runtime.
Explicit Chat model overrides remain supported. Different Stack versions launch
new Sessions rather than altering running workspaces.

See [Agent Stacks](../agents/agent-stacks.md) for capability limits and migration.
