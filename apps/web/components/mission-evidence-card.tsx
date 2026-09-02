"use client";

import { ExternalLink } from "lucide-react";
import type { MissionType } from "@/lib/missions";
import {
  hasMissionEvidence,
  type MissionEvidence,
  type PreviewEvidence,
  type ProjectCheckCategory,
} from "@/lib/mission-evidence";
import { cn } from "@/lib/utils";

const CHECK_LABELS: Record<ProjectCheckCategory, string> = {
  typecheck: "Typecheck",
  lint: "Lint/check",
  tests: "Tests",
  build: "Production build",
};

type DisplayStatus =
  | "Passed"
  | "Failed"
  | "Observed"
  | "Pending"
  | "Skipped"
  | "Building"
  | "Ready";

function statusClassName(status: DisplayStatus): string {
  if (status === "Passed" || status === "Observed" || status === "Ready") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "Failed") {
    return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-border bg-muted/60 text-muted-foreground";
}

function EvidenceBadge({
  label,
  status,
}: {
  label: string;
  status: DisplayStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium leading-none",
        statusClassName(status),
      )}
    >
      <span className="truncate">{label}</span>
      <span aria-hidden="true">·</span>
      <span>{status}</span>
    </span>
  );
}

function ExternalEvidenceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

function deliveryStatus(
  status: "observed" | "failed" | "pending" | "skipped",
): DisplayStatus {
  if (status === "observed") return "Observed";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Pending";
  return "Skipped";
}

function previewStatus(status: PreviewEvidence["status"]): DisplayStatus {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  return "Building";
}

export function MissionEvidenceCard({
  missionType,
  evidence,
  preview,
  isStreaming = false,
}: {
  missionType: MissionType;
  evidence: MissionEvidence;
  preview?: PreviewEvidence;
  isStreaming?: boolean;
}) {
  if (missionType === "custom" || isStreaming) {
    return null;
  }

  const hasEvidence = hasMissionEvidence(evidence) || Boolean(preview);
  if (!hasEvidence) {
    if (missionType !== "ship_feature") {
      return null;
    }

    return (
      <section
        aria-labelledby={`mission-evidence-${evidence.anchorAssistantMessageId}`}
        className="mt-3 rounded-lg border border-dashed border-border/80 px-3 py-2.5"
      >
        <h3
          id={`mission-evidence-${evidence.anchorAssistantMessageId}`}
          className="text-xs font-medium text-foreground"
        >
          Mission evidence
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No verification evidence captured for this Mission.
        </p>
      </section>
    );
  }

  const browserLabel = evidence.browser?.exercised
    ? "Browser exercised"
    : "Browser activity";

  return (
    <details className="group/evidence mt-3 rounded-lg border border-border/80 bg-card/60">
      <summary className="cursor-pointer list-none rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-foreground">
            Mission evidence
          </span>
          <span className="text-[11px] text-muted-foreground">Details</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {evidence.checks.map((check) => (
            <EvidenceBadge
              key={check.category}
              label={CHECK_LABELS[check.category]}
              status={check.status === "passed" ? "Passed" : "Failed"}
            />
          ))}
          {evidence.browser && (
            <EvidenceBadge
              label={browserLabel}
              status={
                evidence.browser.status === "failed" ? "Failed" : "Observed"
              }
            />
          )}
          {evidence.delivery.commit && (
            <EvidenceBadge
              label={evidence.delivery.commit.label}
              status={deliveryStatus(evidence.delivery.commit.status)}
            />
          )}
          {evidence.delivery.pullRequest && (
            <EvidenceBadge
              label={evidence.delivery.pullRequest.label}
              status={deliveryStatus(evidence.delivery.pullRequest.status)}
            />
          )}
          {preview && (
            <EvidenceBadge
              label={preview.label}
              status={previewStatus(preview.status)}
            />
          )}
        </span>
      </summary>

      <div className="space-y-4 border-t border-border/70 px-3 py-3 text-xs">
        {evidence.checks.map((check) => {
          const hadEarlierFailure = check.attempts
            .slice(0, -1)
            .some((attempt) => attempt.status === "failed");

          return (
            <section key={check.category} className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium text-foreground">
                  {CHECK_LABELS[check.category]}
                </h4>
                <span
                  className={cn(
                    "font-medium",
                    check.status === "passed"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-red-700 dark:text-red-300",
                  )}
                >
                  {check.status === "passed" ? "Passed" : "Failed"}
                  {check.exitCode === undefined
                    ? ""
                    : ` (exit ${check.exitCode})`}
                </span>
              </div>
              <code className="block overflow-x-auto rounded bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                {check.command}
              </code>
              {check.attempts.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {check.attempts.length} runs observed
                  {hadEarlierFailure ? "; an earlier run failed" : ""}.
                </p>
              )}
            </section>
          );
        })}

        {evidence.browser && (
          <section className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium text-foreground">Browser</h4>
              <span
                className={cn(
                  "font-medium",
                  evidence.browser.status === "failed"
                    ? "text-red-700 dark:text-red-300"
                    : "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {evidence.browser.status === "failed"
                  ? "Failed"
                  : evidence.browser.exercised
                    ? "Exercised"
                    : "Observed"}
              </span>
            </div>
            <ul className="space-y-1">
              {evidence.browser.currentEvents.map((event) => (
                <li
                  key={event.operation}
                  className="flex min-w-0 flex-col gap-0.5 rounded bg-muted/40 px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="text-foreground">{event.detail}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[11px]",
                      event.status === "failed"
                        ? "text-red-700 dark:text-red-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {event.status === "failed" ? "Failed" : "Observed"}
                    {event.exitCode === undefined
                      ? ""
                      : ` · exit ${event.exitCode}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(evidence.delivery.commit ||
          evidence.delivery.pullRequest ||
          preview) && (
          <section className="space-y-1.5">
            <h4 className="font-medium text-foreground">Delivery</h4>
            <ul className="space-y-1 text-muted-foreground">
              {evidence.delivery.commit && (
                <li>
                  {evidence.delivery.commit.url ? (
                    <ExternalEvidenceLink href={evidence.delivery.commit.url}>
                      {evidence.delivery.commit.label}
                    </ExternalEvidenceLink>
                  ) : (
                    evidence.delivery.commit.label
                  )}{" "}
                  · {deliveryStatus(evidence.delivery.commit.status)}
                </li>
              )}
              {evidence.delivery.pullRequest && (
                <li>
                  {evidence.delivery.pullRequest.url ? (
                    <ExternalEvidenceLink
                      href={evidence.delivery.pullRequest.url}
                    >
                      {evidence.delivery.pullRequest.label}
                    </ExternalEvidenceLink>
                  ) : (
                    evidence.delivery.pullRequest.label
                  )}{" "}
                  · {deliveryStatus(evidence.delivery.pullRequest.status)}
                </li>
              )}
              {preview && (
                <li>
                  {preview.url ? (
                    <ExternalEvidenceLink href={preview.url}>
                      {preview.label}
                    </ExternalEvidenceLink>
                  ) : (
                    preview.label
                  )}{" "}
                  · {previewStatus(preview.status)}
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
