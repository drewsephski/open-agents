# Agent behavior

Launchstack supplies shared response guidance to both the built-in agent and the connected Codex backend. Replies lead with the outcome, explain material decisions in plain language, and report only observed verification. Users can request a different format or more detail in their messages.

## Commands and skills

Start a message with `/` for app commands or `$` for installed skills. Both menus support filtering, arrow keys, Tab/Enter selection, and Escape dismissal. The namespaces are separate: `/review` is an app command and `$review` can be an installed skill.

- `/help` opens local command help without a model request when sent alone without attachments.
- `/plan task` asks for a read-only implementation plan.
- `/review [area]` asks for a read-only review; without arguments it reviews the workspace diff.
- `/explain topic` asks for a read-only explanation grounded in source evidence.
- `/pstack [task]` and `/pstack-off [task]` switch the chat's engineering mode.

Planning, review, explanation, and model-side help requests suppress automatic commits and PR creation, even when enabled in Preferences. Their model instructions prohibit edits and delivery actions for that turn. These instructions do not themselves enforce a tool permission sandbox.

For example, `$my-skill Review the checkout` explicitly selects an installed skill. The app loads its instructions before running either backend, substitutes `$ARGUMENTS`, and supplies the skill directory for referenced resources. The model is told not to reload an already applied skill. Unknown, unavailable, empty, or non-user-invocable skills fail with a descriptive error; invocation does not install anything. Names containing spaces are quoted automatically by menu selection, for example `$"Poteto Mode" Fix the bug`. Skills with `disable-model-invocation: true` remain directly user-invocable unless `user-invocable: false` is also set. Invocation grants no additional tools or approval bypasses.

Invocations must start the message, allowing leading whitespace. Currency amounts, shell substitutions, paths, quoted examples, and inline mentions do not select a skill or command. Skills can be installed through Preferences; app commands are available without a skill catalog.

## Pstack engineering mode

Start a message with `/pstack` to enable engineering mode in the current chat. Include a task after the command, such as `/pstack Fix the settings crash`, or send the command alone for a brief acknowledgement. It stays active on later turns. Send `/pstack-off` to return to the standard workflow; a task can follow that command too.

The commands appear in slash-command suggestions even before workspace skills are available. Preferences explains how to use them. They use the app-command namespace; installed skills use the separate dollar namespace.

Mode state is derived from explicit commands at the start of saved user messages. Assistant replies, tool output, snippets, quoted examples, and mentions elsewhere in a message do not toggle it. The latest command wins. With the same chat history, retries and reloads resolve the same state. New chats start in standard mode. A caller that omits earlier messages also omits their mode changes; there is no separate persisted mode setting.

The adapted workflow covers investigation, bug fixes, features, refactoring, and performance work. It emphasizes narrow changes, explicit data models, root-cause fixes, behavior verification, and evidence-backed replies. It uses the configured models and available tools. It does not add tools or override user scope, repository rules, credential protections, action approvals, or delivery permissions.

## Instruction layers

The built-in agent keeps its core and model-specific prompt, mission guidance, environment, project instructions, and skill catalog. The chat workflow adds shared response guidance, resolved engineering mode, current command guidance, and explicitly selected skill instructions to custom instructions while retaining file-link and external-action guidance. Codex receives the same guidance and selected skill alongside its mission, workspace restrictions, and conversation transcript. When a skill is explicitly selected, referenced resources in its identified directory are permitted as context; credential restrictions still apply.

This is instruction guidance, not a guarantee of model behavior. Prompt and workflow tests establish which instructions reach each backend; they do not prove live model adherence. A live evaluation should exercise a question, feature, bug fix, command-only activation, follow-up turn, and opt-out on each backend before making claims about behavioral consistency.

## Upstream attribution and compatibility

The engineering guidance is adapted from [backnotprop/pstack](https://github.com/backnotprop/pstack), particularly `skills/poteto-mode/SKILL.md`, at commit `157aae39a733135e93d8b5b19ff62c6a84b0ad56`. Its [MIT license notice](licenses/pstack.txt) is included in this repository.

This ships an adapted engineering mode, not the complete upstream skill bundle, custom agent roles, multi-model review panels, or Cursor companion plugins. Existing project and global skills remain available separately. Their own dependencies and harness requirements must be satisfied before promising full upstream workflows.
