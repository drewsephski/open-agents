"use client";

import {
  ArrowRight,
  Check,
  Cloud,
  Cpu,
  GitBranch,
  Globe2,
  LockKeyhole,
  Server,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const totalSteps = 4;
const statusLabels = [
  "Securing repository handoff",
  "Allocating isolated compute",
  "Creating a task branch",
  "Starting the secure preview",
  "Workspace ready",
] as const;

const easeOut = [0.16, 1, 0.3, 1] as const;

export function FeatureSandbox() {
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
          pendingRef.current = setTimeout(run, 2800);
        }
      }, 760);
    }, 800);
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

  const ready = step >= totalSteps;

  return (
    <div className="relative h-[280px] overflow-hidden bg-(--l-code-bg) text-(--l-panel-fg-2)">
      <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between border-(--l-panel-border) border-b px-4">
        <span className="font-mono text-[9px] tracking-[0.08em] text-(--l-panel-fg-3)">
          launchstack / workspace
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-(--l-panel-fg-4)">
          <LockKeyhole className="size-2.5 text-amber-500" />
          encrypted
        </span>
      </div>

      <div className="absolute top-[50px] right-4 bottom-[39px] left-4 rounded-lg border border-(--l-panel-border) border-dashed px-4 py-5">
        <span className="absolute -top-2 left-3 flex items-center gap-1.5 bg-(--l-code-bg) px-1.5 text-[8px] uppercase tracking-[0.14em] text-amber-500">
          <LockKeyhole className="size-2.5" />
          Isolated from your machine
        </span>

        <div className="grid h-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <span className="grid size-9 place-items-center rounded-md border border-(--l-panel-border) bg-(--l-code-bg) text-(--l-panel-fg-3)">
              <Server className="size-3.5" />
            </span>
            <span className="font-mono text-[7px] text-(--l-panel-fg-4)">
              REPO
            </span>
          </div>

          <div className="relative min-w-0">
            <div className="absolute top-1/2 right-full flex w-3 -translate-y-1/2 items-center text-(--l-panel-fg-4)">
              <span className="h-px flex-1 bg-(--l-panel-border)" />
              <motion.span
                animate={{ opacity: step > 0 ? 1 : 0.25, x: step > 0 ? 2 : -2 }}
                transition={{ duration: 0.5, ease: easeOut }}
              >
                <ArrowRight className="size-2.5 text-amber-500" />
              </motion.span>
            </div>

            <motion.div
              className="relative h-[128px] w-full overflow-hidden rounded-lg border bg-[#090909] p-3"
              animate={{
                borderColor:
                  step >= 1
                    ? "rgba(245, 158, 11, 0.55)"
                    : "rgba(255, 255, 255, 0.1)",
                boxShadow: ready
                  ? "0 12px 28px rgba(0, 0, 0, 0.36), 0 0 18px rgba(245, 158, 11, 0.08)"
                  : "0 6px 18px rgba(0, 0, 0, 0.16)",
              }}
              transition={{ duration: 0.55, ease: easeOut }}
            >
              <AnimatePresence>
                {step > 0 && !ready && (
                  <motion.span
                    className="pointer-events-none absolute top-0 bottom-0 w-12 bg-linear-to-r from-transparent via-amber-500/8 to-transparent"
                    initial={{ x: -48, opacity: 0 }}
                    animate={{ x: 250, opacity: [0, 1, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 1.45,
                      ease: "linear",
                      repeat: Number.POSITIVE_INFINITY,
                    }}
                  />
                )}
              </AnimatePresence>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-md bg-amber-500/10 text-amber-500">
                    <Cloud className="size-3.5" />
                  </span>
                  <div>
                    <div className="text-[10px] text-(--l-panel-fg)">
                      Cloud workspace
                    </div>
                    <div className="font-mono text-[7px] text-(--l-panel-fg-4)">
                      iad1 · node 24 · pnpm
                    </div>
                  </div>
                </div>
                <motion.span
                  className="size-1.5 rounded-full bg-amber-500"
                  animate={{
                    opacity: step >= 1 ? 1 : 0.2,
                    boxShadow:
                      step >= 1 ? "0 0 8px rgba(245, 158, 11, 0.55)" : "none",
                  }}
                  transition={{ duration: 0.45, ease: easeOut }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-white/[0.025] p-2">
                  <motion.span
                    className="mb-1 block w-fit text-amber-500"
                    animate={{
                      opacity: step >= 2 ? 1 : 0.25,
                      scale: step >= 2 ? 1 : 0.9,
                    }}
                    transition={{ duration: 0.45, ease: easeOut }}
                  >
                    <GitBranch className="size-3" />
                  </motion.span>
                  <div className="font-mono text-[7px] text-(--l-panel-fg-4)">
                    TASK BRANCH
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[8px] text-(--l-panel-fg-2)">
                    {step >= 2 ? "feat/auth-flow" : "creating…"}
                  </div>
                </div>
                <div className="rounded-md bg-white/[0.025] p-2">
                  <motion.span
                    className="mb-1 block w-fit text-amber-500"
                    animate={{
                      opacity: step >= 3 ? 1 : 0.25,
                      scale: step >= 3 ? 1 : 0.9,
                    }}
                    transition={{ duration: 0.45, ease: easeOut }}
                  >
                    <Globe2 className="size-3" />
                  </motion.span>
                  <div className="font-mono text-[7px] text-(--l-panel-fg-4)">
                    LIVE PREVIEW
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[8px] text-(--l-panel-fg-2)">
                    {step >= 3 ? "port 3000 live" : "waiting…"}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="relative flex flex-col items-center gap-1.5">
            <motion.span
              className="grid size-9 place-items-center rounded-md border bg-(--l-code-bg)"
              animate={{
                borderColor:
                  step >= 3
                    ? "rgba(245, 158, 11, 0.55)"
                    : "rgba(255, 255, 255, 0.1)",
                color: step >= 3 ? "#f59e0b" : "rgba(255, 255, 255, 0.18)",
                scale: ready ? [1, 1.06, 1] : 1,
              }}
              transition={{ duration: 0.5, ease: easeOut }}
            >
              {ready ? (
                <Check className="size-3.5" strokeWidth={2.5} />
              ) : (
                <Globe2 className="size-3.5" />
              )}
            </motion.span>
            <span className="font-mono text-[7px] text-(--l-panel-fg-4)">
              PREVIEW
            </span>
            <motion.div
              className="absolute top-[14px] right-full flex w-3 items-center text-(--l-panel-fg-4)"
              animate={{ opacity: step >= 3 ? 1 : 0.25 }}
              transition={{ duration: 0.5, ease: easeOut }}
            >
              <span className="h-px flex-1 bg-(--l-panel-border)" />
              <ArrowRight className="size-2.5 text-amber-500" />
            </motion.div>
          </div>
        </div>

        <div className="absolute right-4 bottom-2 left-4 flex items-center justify-center gap-2 text-[8px] text-(--l-panel-fg-4)">
          <Cpu className="size-2.5" />
          <span>
            Compute, dependencies, and files stay inside this boundary
          </span>
        </div>
      </div>

      <div className="absolute inset-x-4 bottom-0 flex h-9 items-center justify-between">
        <div className="absolute inset-x-0 top-0 h-px bg-(--l-panel-border)">
          <motion.div
            className="h-full bg-amber-500"
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.7, ease: easeOut }}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={step}
            className="text-[9px] text-(--l-panel-fg-3)"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.22 }}
          >
            {ready ? "Your machine stays untouched" : statusLabels[step]}
          </motion.span>
        </AnimatePresence>
        <span className="font-mono text-[8px] text-amber-500">
          {ready ? "ISOLATED · READY" : `${step}/4`}
        </span>
      </div>
    </div>
  );
}
