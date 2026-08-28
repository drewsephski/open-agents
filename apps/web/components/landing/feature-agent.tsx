"use client";

import { Check, FileCode2, ShieldCheck, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const changes = [
  {
    file: "lib/auth.ts",
    code: "export const { handlers, signIn } = betterAuth(config)",
    additions: "+18",
  },
  {
    file: "app/api/auth/[...all]/route.ts",
    code: "export const { GET, POST } = handlers",
    additions: "+4",
  },
  {
    file: "middleware.ts",
    code: "return requireSession(request)",
    additions: "+12",
  },
] as const;

const totalSteps = changes.length + 1;

export function FeatureAgent() {
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
  }, []);

  const run = useCallback(() => {
    clear();
    setStep(0);
    pendingRef.current = setTimeout(() => {
      let nextStep = 0;
      timerRef.current = setInterval(() => {
        nextStep += 1;
        setStep(nextStep);
        if (nextStep >= totalSteps) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          pendingRef.current = setTimeout(run, 2800);
        }
      }, 700);
    }, 900);
  }, [clear]);

  useEffect(() => {
    if (prefersReducedMotion) {
      clear();
      setStep(totalSteps);
      return clear;
    }
    run();
    return clear;
  }, [clear, prefersReducedMotion, run]);

  const isComplete = step >= totalSteps;
  const progress = (step / totalSteps) * 100;

  return (
    <div className="flex h-[280px] flex-col overflow-hidden bg-(--l-code-bg) text-(--l-panel-fg-2)">
      <div className="flex h-9 shrink-0 items-center justify-between border-(--l-panel-border) border-b px-4">
        <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.08em]">
          <span className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.55)]" />
          <span className="text-(--l-panel-fg-3)">TASK</span>
          <span className="text-(--l-panel-fg-5)">/</span>
          <span className="text-(--l-panel-fg-2)">auth-flow</span>
        </div>
        <span className="text-[9px] text-(--l-panel-fg-4)">
          {isComplete ? "Ready for review" : "Agent working"}
        </span>
      </div>

      <div className="border-(--l-panel-border) border-b px-4 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-amber-500">
          <Sparkles className="size-2.5" />
          Natural language request
        </div>
        <p className="text-[11px] leading-[1.45] text-(--l-panel-fg)">
          “Add secure email sign-in and protect every dashboard route.”
        </p>
      </div>

      <div className="min-h-0 flex-1 px-4 py-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[8px] uppercase tracking-[0.14em]">
          <span className="text-(--l-panel-fg-4)">Implementation</span>
          <span className="font-mono text-(--l-panel-fg-5)">3 files</span>
        </div>
        <div className="space-y-1">
          {changes.map((change, index) => {
            const isDone = index < step;
            const isActive = index === step && !isComplete;
            return (
              <div
                key={change.file}
                className="grid min-h-8 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2 rounded-sm px-1.5 py-1 transition-all duration-300"
                style={{
                  backgroundColor: isActive
                    ? "rgba(245, 158, 11, 0.07)"
                    : "transparent",
                  opacity: isDone || isActive ? 1 : 0.25,
                }}
              >
                <span
                  className="grid size-[18px] place-items-center rounded border bg-(--l-code-bg)"
                  style={{
                    borderColor:
                      isDone || isActive
                        ? "rgba(245, 158, 11, 0.55)"
                        : "var(--l-panel-border)",
                    color:
                      isDone || isActive ? "#f59e0b" : "var(--l-panel-fg-5)",
                  }}
                >
                  {isDone ? (
                    <Check className="size-2.5" strokeWidth={2.5} />
                  ) : (
                    <FileCode2 className="size-2.5" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-[9px] text-(--l-panel-fg-2)">
                    {change.file}
                  </div>
                  <div className="truncate font-mono text-[8px] text-(--l-panel-fg-4)">
                    <span className="mr-1 text-amber-500">+</span>
                    {change.code}
                  </div>
                </div>
                <span className="font-mono text-[8px] text-amber-500">
                  {isDone ? change.additions : isActive ? "•••" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="h-[52px] shrink-0 border-(--l-panel-border) border-t px-4 py-2 transition-colors duration-500"
        style={{
          backgroundColor: isComplete
            ? "rgba(245, 158, 11, 0.055)"
            : "transparent",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-500"
              style={{
                borderColor: isComplete ? "#f59e0b" : "var(--l-panel-border)",
                color: isComplete ? "#f59e0b" : "var(--l-panel-fg-4)",
                boxShadow: isComplete
                  ? "0 0 14px rgba(245, 158, 11, 0.2)"
                  : "none",
              }}
            >
              {isComplete ? (
                <Check className="size-3" strokeWidth={2.5} />
              ) : (
                <ShieldCheck className="size-3" />
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[10px] text-(--l-panel-fg-2)">
                {isComplete
                  ? "Ready for review"
                  : step < changes.length
                    ? "Writing the implementation"
                    : "Verifying the result"}
              </div>
              <div className="truncate font-mono text-[8px] text-(--l-panel-fg-4)">
                {isComplete
                  ? "typecheck passed · 3 files · +34 lines"
                  : step < changes.length
                    ? "Applying secure auth patterns…"
                    : "Running pnpm typecheck…"}
              </div>
            </div>
          </div>
          {isComplete && (
            <span className="rounded-full border border-amber-500/35 px-2 py-0.5 text-[8px] font-medium text-amber-500">
              PASSED
            </span>
          )}
        </div>
        <div className="h-px overflow-hidden bg-(--l-panel-border)">
          <div
            className="h-full bg-amber-500 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
