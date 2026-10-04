# Freeze external Action account identity at Session launch

Stacks declare capabilities and remain portable across a User's authorized
accounts. A Session freezes provider-safe account IDs and display labels alongside
its effective Stack snapshot, before infrastructure/model work. Its Chats inherit
the same binding. A database trigger prevents binding changes. New Stack versions
or different account choices require a new Session.

Session-level binding fits the existing launch provenance and avoids a Chat's
first durable reconstruction making an implicit account choice. Provider execution
sessions remain per Chat and exact scope, preserving approvals and conversation
isolation. Backend Forks to unsupported runtimes receive no external Action tools.

Freeze identity, not authorization. Required IDs must remain active, enabled
PRIVATE accounts for the same User/toolkit before tool loading and every dispatch.
Another currently active account never substitutes. Remote pinned-account
enforcement is a second boundary; requests already accepted cannot be recalled.

The installed Composio SDK supports multiple accounts. We expose bounded lists
and an intentional launch selector, while selecting at most one account per toolkit
for an execution context. A unique eligible account can be selected automatically.
No preference store, shared accounts, aliases or credential copies are introduced.
Safe provider word identifiers/account IDs are display fallbacks; they are not
claimed to be verified email addresses or workspace names.

Historical identity is not backfilled. A legacy Chat may use exactly one persisted
runtime scope as proof; absent/ambiguous proof blocks required Actions. Archive
retains this proof while deleting remote runtime records on a bounded best-effort
basis. A confirmed remote 404 permits recreation of that same scope after live
authorization revalidation, never retrying an action or widening authority.

Readiness composes existing access-policy checks, and Session creation repeats it
independently. This extends ADR 0004's live authorization rule while making account
identity immutable. See [Action Providers](../agents/action-providers.md) and
[read verification](../action-read-verification.md).
