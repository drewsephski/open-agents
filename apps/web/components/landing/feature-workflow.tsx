"use client";

import { Check, GitPullRequest, Laptop, Radio, WifiOff } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const totalSteps = 4;

export function FeatureWorkflow() {
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pendingRef.current) clearTimeout(pendingRef.current);
    timerRef.current = null;
    pendingRef.current = null;
  }, []);

  const run = useCallback(() => {
    clear();
    setStep(0);
    pendingRef.current = setTimeout(() => {
      let next = 0;
      timerRef.current = setInterval(() => {
        next += 1;
        setStep(next);
        if (next >= totalSteps) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          pendingRef.current = setTimeout(run, 3000);
        }
      }, 850);
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

  const finished = step >= totalSteps;

  return (
    <div className="relative h-[280px] overflow-hidden bg-(--l-code-bg) text-(--l-panel-fg-2)">
      <div className="absolute top-4 left-4 w-[245px] rounded-lg border border-(--l-panel-border) bg-[#090909] px-3 py-2.5 max-sm:w-[190px]">
        <div className="mb-1 flex items-center gap-1.5 text-[8px] uppercase tracking-[0.12em] text-amber-500">
          <Radio className="size-2.5" />
          Task running
        </div>
        <p className="text-[10px] leading-relaxed text-(--l-panel-fg-2)">
          “Finish the auth flow and open a pull request.”
        </p>
      </div>

      <div
        className="absolute top-4 right-4 flex h-[58px] w-[150px] items-center gap-2.5 rounded-lg border px-3 transition-all duration-500 max-sm:w-[115px] max-sm:gap-1.5 max-sm:px-2"
        style={{
          borderColor:
            step >= 1 ? "rgba(245, 158, 11, 0.42)" : "var(--l-panel-border)",
          backgroundColor: step >= 1 ? "rgba(245, 158, 11, 0.045)" : "#090909",
        }}
      >
        <span className="grid size-7 place-items-center rounded-md border border-(--l-panel-border) text-(--l-panel-fg-3)">
          {step >= 1 ? (
            <WifiOff className="size-3.5 text-amber-500" />
          ) : (
            <Laptop className="size-3.5" />
          )}
        </span>
        <div>
          <div className="text-[9px] text-(--l-panel-fg-2)">Your browser</div>
          <div className="mt-0.5 font-mono text-[7px] text-(--l-panel-fg-4)">
            {step >= 1 ? "disconnected" : "connected"}
          </div>
        </div>
      </div>

      <div className="absolute top-[94px] right-4 left-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-[0.14em] text-(--l-panel-fg-4)">
            Cloud workflow continues
          </span>
          <span className="font-mono text-[7px] text-(--l-panel-fg-5)">
            run_84f2
          </span>
        </div>
        <div className="relative flex items-start justify-between">
          <div className="absolute top-3 right-3 left-3 h-px bg-(--l-panel-border)">
            <div
              className="h-full bg-amber-500 transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(step / 3, 1) * 100}%` }}
            />
          </div>
          {["Started", "Working", "Verified", "PR ready"].map(
            (label, index) => {
              const reached = index <= step;
              return (
                <div
                  key={label}
                  className="relative z-10 flex w-14 flex-col items-center"
                >
                  <span
                    className="grid size-6 place-items-center rounded-full border bg-(--l-code-bg) transition-all duration-300"
                    style={{
                      borderColor: reached
                        ? "#f59e0b"
                        : "var(--l-panel-border)",
                      color: reached ? "#f59e0b" : "var(--l-panel-fg-5)",
                      boxShadow:
                        index === step && !finished
                          ? "0 0 12px rgba(245, 158, 11, 0.22)"
                          : "none",
                    }}
                  >
                    {index < step || finished ? (
                      <Check className="size-3" strokeWidth={2.5} />
                    ) : (
                      <span className="size-1 rounded-full bg-current" />
                    )}
                  </span>
                  <span className="mt-2 text-center text-[8px] text-(--l-panel-fg-3)">
                    {label}
                  </span>
                </div>
              );
            },
          )}
        </div>
      </div>

      <div
        className="absolute right-4 bottom-4 left-4 flex h-[66px] items-center justify-between overflow-hidden rounded-lg border px-3 transition-all duration-500"
        style={{
          borderColor: finished
            ? "rgba(245, 158, 11, 0.55)"
            : "var(--l-panel-border)",
          backgroundColor: finished ? "rgba(245, 158, 11, 0.06)" : "#090909",
          opacity: step >= 3 ? 1 : 0.35,
          transform: step >= 3 ? "translateY(0)" : "translateY(6px)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-amber-500/10 text-amber-500">
            <GitPullRequest className="size-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-(--l-panel-fg)">PR #184</span>
              {finished && (
                <span className="rounded-full border border-amber-500/35 px-1.5 py-px text-[7px] text-amber-500">
                  CHECKS PASSED
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[8px] text-(--l-panel-fg-4)">
              feat/auth-flow → main · 3 files
            </div>
          </div>
        </div>
        <span className="text-[9px] text-amber-500">
          {finished ? "Review ↗" : "Preparing…"}
        </span>
      </div>
    </div>
  );
}
