import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PromptCopyButton } from "./prompt-copy-button";

type BentoItem = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly prompt: string;
};

const items: readonly BentoItem[] = [
  {
    id: "001",
    title: "Feature work",
    body: "Hand off a scoped feature that touches components, APIs, tests, or configuration. The agent works across the repository and checks the result.",
    prompt:
      "Implement [feature] in this repository. First inspect the existing architecture and conventions. Make the smallest complete change, add or update relevant tests, and run the project's lint, type-check, and test commands before summarizing the result.",
  },
  {
    id: "002",
    title: "Bug fixes",
    body: "Send an error, failing test, or broken flow. The agent searches for the cause, makes a targeted change, and runs the relevant checks.",
    prompt:
      "Review the current branch for bugs and regressions. Trace each issue to its root cause, prioritize findings by user impact, and fix confirmed problems with targeted changes. Run the relevant tests and report what you verified.",
  },
  {
    id: "003",
    title: "CI repair",
    body: "Give an agent a failing check to investigate. It can inspect logs, update the branch, and rerun the same project commands before you review it.",
    prompt:
      "Investigate the failing CI checks on this branch. Reproduce each failure locally, identify whether it comes from the branch or the baseline, and fix only branch-related issues. Rerun the same checks CI uses and summarize any failures that remain.",
  },
  {
    id: "004",
    title: "Parallel backlog",
    body: "Start separate sessions for independent tasks. Each one gets its own sandbox and branch, so work can move at the same time without file conflicts.",
    prompt:
      "Take ownership of [backlog task]. Keep the work limited to this task, preserve unrelated changes, and follow the repository's existing patterns. Verify the completed path and leave the branch ready for review with a concise summary of files changed and checks run.",
  },
];

function mark(index: number) {
  if (index === 0) {
    return (
      <div className="grid grid-cols-2 gap-1" aria-hidden="true">
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-px w-4 bg-(--l-fg-4)" />
        <span className="h-px w-6 bg-(--l-fg-4)" />
        <span className="h-px w-3 bg-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="flex flex-col gap-1" aria-hidden="true">
        <span className="h-1 w-8 border border-(--l-fg-4)" />
        <span className="h-1 w-6 border border-(--l-fg-4)" />
        <span className="h-1 w-4 border border-(--l-fg-4)" />
      </div>
    );
  }
  return (
    <div className="relative h-6 w-8" aria-hidden="true">
      <span className="absolute left-0 top-0 size-2 border border-(--l-fg-4)" />
      <span className="absolute right-0 top-0 size-2 border border-(--l-fg-4)" />
      <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 border border-(--l-fg-4)" />
    </div>
  );
}

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border-subtle)">
        <div className="grid gap-6 border-b border-(--l-border) px-6 py-14 pb-10 sm:gap-10 sm:px-10 md:grid-cols-2 md:gap-0 md:pb-14 md:py-28">
          <div>
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-6xl">
              Work Launchstack
              <br />
              can take on.
            </h2>
          </div>
          <div className="md:pl-10">
            <p className="max-w-md text-balance text-base leading-relaxed text-(--l-fg-2)">
              Use it for contained engineering tasks with a clear finish line.
              Every task stays isolated, produces a reviewable diff, and can
              move from request to pull request in the cloud.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <article
              key={item.id}
              className={`flex h-full flex-col border-b border-(--l-border) px-6 py-8 md:px-10 md:py-9 ${
                index % 2 === 1 ? "md:border-l md:border-l-(--l-border)" : ""
              } ${index >= 2 ? "md:border-b-0" : ""} ${
                index > 0
                  ? "lg:border-l lg:border-l-(--l-border)"
                  : "lg:border-l-0"
              } lg:border-b-0`}
            >
              <div className="font-mono text-[11px] text-(--l-fg-4)">
                {item.id}
              </div>
              <div className="mt-7 flex h-10 items-center">{mark(index)}</div>
              <h3 className="mt-7 text-balance text-2xl font-semibold tracking-tighter">
                {item.title}
              </h3>
              <p className="mt-4 flex-1 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
              <div className="mt-7 border-t border-(--l-border-subtle) pt-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-(--l-fg-4)">
                    Starter prompt
                  </span>
                  <PromptCopyButton prompt={item.prompt} />
                </div>
                <p className="mt-4 line-clamp-5 font-mono text-[11px] leading-relaxed text-(--l-fg-3)">
                  {item.prompt}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
