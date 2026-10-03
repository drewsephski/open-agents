# Agent behavior

Launchstack supplies shared response guidance to both the built-in agent and the connected Codex backend. Replies lead with the outcome, explain material decisions in plain language, and report only observed verification. Users can request a different format or more detail in their messages.

## Pstack engineering mode

Start a message with `/pstack` to enable engineering mode in the current chat. Include a task after the command, such as `/pstack Fix the settings crash`, or send the command alone for a brief acknowledgement. It stays active on later turns. Send `/pstack-off` to return to the standard workflow; a task can follow that command too.

The commands appear in slash-command suggestions even before workspace skills are available. Preferences explains how to use them. They are built-in commands and cannot be shadowed by installed skills.

Mode state is derived from explicit commands at the start of saved user messages. Assistant replies, tool output, snippets, quoted examples, and mentions elsewhere in a message do not toggle it. The latest command wins. With the same chat history, retries and reloads resolve the same state. New chats start in standard mode. A caller that omits earlier messages also omits their mode changes; there is no separate persisted mode setting.

The adapted workflow covers investigation, bug fixes, features, refactoring, and performance work. It emphasizes narrow changes, explicit data models, root-cause fixes, behavior verification, and evidence-backed replies. It uses the configured models and available tools. It does not add tools or override user scope, repository rules, credential protections, action approvals, or delivery permissions.

## Instruction layers

The built-in agent keeps its core and model-specific prompt, mission guidance, environment, project instructions, and skill catalog. The chat workflow adds shared response guidance and the resolved engineering mode to custom instructions while retaining file-link and external-action guidance. Codex receives the same shared guidance and resolved mode alongside its mission, workspace restrictions, and conversation transcript.

This is instruction guidance, not a guarantee of model behavior. Prompt and workflow tests establish which instructions reach each backend; they do not prove live model adherence. A live evaluation should exercise a question, feature, bug fix, command-only activation, follow-up turn, and opt-out on each backend before making claims about behavioral consistency.

## Upstream attribution and compatibility

The engineering guidance is adapted from [backnotprop/pstack](https://github.com/backnotprop/pstack), particularly `skills/poteto-mode/SKILL.md`, at commit `157aae39a733135e93d8b5b19ff62c6a84b0ad56`. Its [MIT license notice](licenses/pstack.txt) is included in this repository.

This ships an adapted engineering mode, not the complete upstream skill bundle, custom agent roles, multi-model review panels, or Cursor companion plugins. Existing project and global skills remain available separately. Their own dependencies and harness requirements must be satisfied before promising full upstream workflows.
