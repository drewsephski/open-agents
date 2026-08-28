# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI for all operations and infer `drewsephski/open-agents` from the current Git remote.

## Conventions

- Create, read, list, comment on, label, and close issues with `gh issue`.
- Use multiline bodies for specs and decision records.
- Resolve whether a number is an issue or pull request before acting because GitHub shares their number space.
- Pull requests are not a triage request surface.

## Skill behavior

- “Publish to the issue tracker” means create a GitHub issue.
- “Fetch the relevant ticket” means read the GitHub issue and its comments.
- Wayfinder maps are issues labelled `wayfinder:map`.
- Wayfinder tickets are child issues labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Use native GitHub sub-issues and dependency relationships when available.
- Claim a Wayfinder ticket by assigning it before working on it.
