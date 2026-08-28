"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FeatureAgent } from "./feature-agent";
import { FeatureSandbox } from "./feature-sandbox";
import { FeatureWorkflow } from "./feature-workflow";
import { Stage, type StageTone } from "./stage";
import { Window } from "./window";

function Spotlight({
  tone,
  title,
  description,
  bullets,
  flip,
  window: windowContent,
}: {
  readonly tone: StageTone;
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
  readonly flip?: boolean;
  readonly window: ReactNode;
}) {
  return (
    <div className="grid items-center md:grid-cols-2">
      <div
        className={cn(
          "px-6 py-16 sm:px-10 md:py-20 lg:py-24",
          flip ? "order-1 md:order-2" : "order-1 md:order-1",
        )}
      >
        <h2 className="text-balance text-2xl font-semibold tracking-tighter sm:text-3xl md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-lg">
          {description}
        </p>
        <ul className="mt-4 space-y-3 sm:mt-5">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 text-(--l-fg-2) sm:text-lg"
            >
              <span className="h-1.5 w-1.5 bg-(--l-fg-2)" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div
        className={flip ? "order-2 md:order-1 -mr-px" : "order-2 md:order-2"}
      >
        <Stage tone={tone}>
          <div className="mx-auto w-full max-w-[1160px]">
            <Window>{windowContent}</Window>
          </div>
        </Stage>
      </div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section>
      <div className="relative mx-auto max-w-[1320px] overflow-hidden">
        <div
          className="absolute left-1/2 top-0 hidden h-full w-px md:block"
          style={{ backgroundColor: "var(--l-border)" }}
        />
        <div>
          <Spotlight
            tone="slate"
            title="Give it a task, not a code snippet."
            description="Ask Launchstack to trace a bug, add a feature, update a dependency, or repair a failing build. The agent can inspect the repository, edit files, run commands, and verify its work in one session."
            bullets={[
              "Build features across multiple files",
              "Investigate bugs before changing code",
              "Run type checks and tests before handoff",
            ]}
            window={<FeatureAgent />}
          />

          <Spotlight
            tone="ash"
            title="Keep agent work off your machine."
            description="Every session gets an isolated cloud sandbox and its own Git branch. Agents can install dependencies, start development servers, and test changes without competing for your local files or compute."
            bullets={[
              "Run several tasks on separate branches",
              "Preview changes before they reach your codebase",
              "Hibernate inactive sandboxes and restore their files",
            ]}
            flip
            window={<FeatureSandbox />}
          />

          <Spotlight
            tone="iron"
            title="Come back when the work is ready."
            description="Launchstack runs each agent turn as a durable workflow. You can leave the page, reconnect from another device, and continue following the same run instead of keeping a browser tab and local process alive."
            bullets={[
              "Resume long tasks after an interruption",
              "Review the diff and share a read-only session",
              "Optionally commit, push, and open a pull request",
            ]}
            window={<FeatureWorkflow />}
          />
        </div>
      </div>
    </section>
  );
}
