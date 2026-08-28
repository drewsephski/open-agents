"use client";

/* eslint-disable jsx-a11y/prefer-tag-over-role -- SVG has no native button element. */

import { useEffect, useRef, useState } from "react";
import { Stage } from "./stage";

const steps = [
  {
    number: "01",
    eyebrow: "YOUR TASK",
    title: "Describe the work",
    detail: "Prompt + repository",
    example: "“Add CSV export”",
    accent: "#00d4ff",
    x: 5,
  },
  {
    number: "02",
    eyebrow: "CLOUD WORKSPACE",
    title: "Prepare workspace",
    detail: "Provision · clone · branch",
    example: "Starting an isolated sandbox",
    accent: "#22c55e",
    x: 69,
  },
  {
    number: "03",
    eyebrow: "CODING AGENT",
    title: "Build and verify",
    detail: "Inspect · edit · test",
    example: "Editing files · running tests",
    accent: "#a855f7",
    x: 133,
  },
  {
    number: "04",
    eyebrow: "READY TO REVIEW",
    title: "Ship the change",
    detail: "Diff · preview · PR",
    example: "Preparing the diff and preview",
    accent: "#ffd800",
    x: 197,
  },
] as const;

const connections = [
  { id: "task-workspace", d: "M 57 54 H 69" },
  { id: "workspace-agent", d: "M 121 54 H 133" },
  { id: "agent-review", d: "M 185 54 H 197" },
] as const;

function FlowCard({
  step,
  index,
  flowStart,
  repeatCount,
  onSelect,
}: {
  readonly step: (typeof steps)[number];
  readonly index: number;
  readonly flowStart: number;
  readonly repeatCount: "1" | "indefinite";
  readonly onSelect: (index: number) => void;
}) {
  const center = step.x + 26;
  const isInFlow = index >= flowStart;
  const relativeIndex = index - flowStart;
  const start = relativeIndex === 0 ? 0.001 : relativeIndex * 0.25;
  const end = start + 0.14;
  const upperBorder = `M ${step.x} 52 V 36 Q ${step.x} 32 ${step.x + 4} 32 H ${step.x + 48} Q ${step.x + 52} 32 ${step.x + 52} 36 V 52`;
  const lowerBorder = `M ${step.x} 52 V 68 Q ${step.x} 72 ${step.x + 4} 72 H ${step.x + 48} Q ${step.x + 52} 72 ${step.x + 52} 68 V 52`;

  return (
    <g
      aria-label={`Start the workflow from ${step.title}`}
      className="agent-architecture-card cursor-pointer outline-none"
      onClick={() => onSelect(index)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(index);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <text
        className="font-mono"
        fill="rgba(255,255,255,0.35)"
        fontSize="2.5"
        letterSpacing="0.14em"
        textAnchor="middle"
        x={center}
        y="20"
      >
        {step.number}
      </text>
      <rect
        fill="url(#architecture-card)"
        height="40"
        rx="2.5"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="0.45"
        width="52"
        x={step.x}
        y="32"
      />
      {isInFlow
        ? [upperBorder, lowerBorder].map((path) => (
            <path
              className="agent-architecture-border-flow"
              d={path}
              fill="none"
              filter="url(#architecture-particle-glow)"
              key={path}
              opacity="0"
              pathLength="100"
              stroke={step.accent}
              strokeDasharray="100"
              strokeDashoffset="100"
              strokeLinecap="round"
              strokeWidth="0.85"
            >
              <animate
                attributeName="stroke-dashoffset"
                dur="10s"
                keyTimes={`0;${start};${end};1`}
                repeatCount={repeatCount}
                values="100;100;0;0"
              />
              <animate
                attributeName="opacity"
                dur="10s"
                keyTimes={`0;${start};${end};${end + 0.08};1`}
                repeatCount={repeatCount}
                values="0;1;1;0;0"
              />
            </path>
          ))
        : null}
      <rect
        fill={step.accent}
        height="1.5"
        rx="0.75"
        width="12"
        x={center - 6}
        y="38.5"
      />
      <text
        fill="rgba(255,255,255,0.43)"
        fontSize="2.35"
        letterSpacing="0.13em"
        textAnchor="middle"
        x={center}
        y="47"
      >
        {step.eyebrow}
      </text>
      <text
        fill="rgba(255,255,255,0.94)"
        fontSize="5"
        fontWeight="600"
        textAnchor="middle"
        x={center}
        y="57"
      >
        {step.title}
      </text>
      <text
        fill="rgba(255,255,255,0.48)"
        fontSize="2.55"
        textAnchor="middle"
        x={center}
        y="66"
      >
        {step.detail}
      </text>
      {isInFlow ? (
        <text
          className="agent-architecture-stage-example font-mono"
          fill={step.accent}
          fontSize="2.35"
          opacity="0"
          textAnchor="middle"
          x={center}
          y="82"
        >
          {step.example}
          <animate
            attributeName="opacity"
            dur="10s"
            keyTimes={`0;${start};${start + 0.015};${end};${end + 0.08};1`}
            repeatCount={repeatCount}
            values="0;0;1;1;0;0"
          />
        </text>
      ) : null}
    </g>
  );
}

export function AgentArchitecture() {
  const [flow, setFlow] = useState({ start: 0, loops: true, runId: 0 });
  const resetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  function startFlow(index: number) {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setFlow((current) => ({
      start: index,
      loops: false,
      runId: current.runId + 1,
    }));
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    resetTimerRef.current = setTimeout(
      () =>
        setFlow((current) => ({
          start: 0,
          loops: true,
          runId: current.runId + 1,
        })),
      prefersReducedMotion
        ? 800
        : ((steps.length - 1 - index) * 0.25 + 0.22) * 10_000 + 150,
    );
  }

  return (
    <section className="border-y border-(--l-border-subtle)">
      <div className="mx-auto max-w-[1320px] px-6 py-20 sm:px-10 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold leading-[1.06] tracking-tighter sm:text-4xl md:text-5xl">
            From task to pull request.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-(--l-fg-2)">
            Launchstack prepares an isolated workspace first, lets the agent
            build and test inside it, then brings you back a reviewable change.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-[1160px] sm:mt-16">
          <Stage tone="iron">
            <div className="relative overflow-hidden rounded-xl border border-black/20 bg-[#11110f] shadow-[0_34px_80px_rgba(0,0,0,0.28),0_10px_24px_rgba(0,0,0,0.18)] sm:rounded-2xl">
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                aria-hidden="true"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                  maskImage:
                    "radial-gradient(ellipse at center, black 14%, transparent 78%)",
                }}
              />
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40 sm:px-5 sm:text-[10px]">
                <span>Launchstack workflow</span>
                <span className="hidden text-white/25 sm:inline">
                  Select a phase to restart
                </span>
                <span className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.65)]" />
                  Flowing
                </span>
              </div>
              <div className="px-4 py-6 sm:hidden">
                {steps.map((step, index) => (
                  <div key={step.number}>
                    <button
                      aria-label={`Start the workflow from ${step.title}`}
                      className="grid w-full grid-cols-[2rem_1fr] items-center gap-3 border border-white/12 bg-[linear-gradient(180deg,#20201e_0%,#161614_100%)] px-4 py-4 text-left transition-colors duration-200 ease-out hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      onClick={() => startFlow(index)}
                      type="button"
                    >
                      <span className="font-mono text-[10px] text-white/35">
                        {step.number}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-0.5 w-5 rounded-full"
                            style={{ backgroundColor: step.accent }}
                          />
                          <span className="font-mono text-[9px] tracking-[0.12em] text-white/40">
                            {step.eyebrow}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-medium text-white/95">
                          {step.title}
                        </h3>
                        <p className="mt-1 text-[11px] text-white/45">
                          {step.detail}
                        </p>
                      </div>
                    </button>
                    {index < steps.length - 1 ? (
                      <div className="mx-auto flex h-7 w-px items-center justify-center bg-white/15">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: steps[index + 1].accent }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <svg
                key={flow.runId}
                aria-label="Launchstack workflow: describe a coding task, let an agent build and verify it in an isolated cloud workspace, then review the resulting pull request"
                className="relative hidden h-auto w-full text-white/30 sm:block"
                role="img"
                viewBox="0 0 254 94"
              >
                <title>From coding task to review-ready pull request</title>
                <defs>
                  <filter
                    id="architecture-particle-glow"
                    height="600%"
                    width="600%"
                    x="-250%"
                    y="-250%"
                  >
                    <feGaussianBlur result="blur" stdDeviation="1.3" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <linearGradient
                    id="architecture-card"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0" stopColor="#20201e" />
                    <stop offset="1" stopColor="#161614" />
                  </linearGradient>
                  <marker
                    id="architecture-arrow"
                    markerHeight="6"
                    markerWidth="6"
                    orient="auto"
                    refX="5"
                    refY="3"
                    viewBox="0 0 6 6"
                  >
                    <path
                      fill="rgba(255,255,255,0.36)"
                      d="M 0 0 L 6 3 L 0 6 Z"
                    />
                  </marker>
                </defs>

                <g
                  className="agent-architecture-paths"
                  fill="none"
                  markerEnd="url(#architecture-arrow)"
                  stroke="currentColor"
                  strokeWidth="0.45"
                >
                  {connections.map((connection) => (
                    <path
                      d={connection.d}
                      id={`agent-route-${connection.id}`}
                      key={connection.id}
                      pathLength="100"
                    />
                  ))}
                </g>
                <g
                  className="agent-architecture-particles"
                  filter="url(#architecture-particle-glow)"
                  aria-hidden="true"
                >
                  {connections.map((connection, index) => {
                    if (index < flow.start) return null;
                    const relativeIndex = index - flow.start;
                    const start = 0.15 + relativeIndex * 0.25;
                    const end = 0.24 + relativeIndex * 0.25;
                    return (
                      <circle
                        fill={steps[index + 1].accent}
                        key={connection.id}
                        opacity="0"
                        r="1.55"
                      >
                        <animate
                          attributeName="opacity"
                          dur="10s"
                          keyTimes={`0;${start};${start + 0.005};${end - 0.005};${end};1`}
                          repeatCount={flow.loops ? "indefinite" : "1"}
                          values="0;0;1;1;0;0"
                        />
                        <animateMotion
                          dur="10s"
                          keyPoints="0;0;1;1"
                          keyTimes={`0;${start};${end};1`}
                          repeatCount={flow.loops ? "indefinite" : "1"}
                        >
                          <mpath href={`#agent-route-${connection.id}`} />
                        </animateMotion>
                      </circle>
                    );
                  })}
                </g>

                {steps.map((step, index) => (
                  <FlowCard
                    flowStart={flow.start}
                    index={index}
                    key={step.number}
                    onSelect={startFlow}
                    repeatCount={flow.loops ? "indefinite" : "1"}
                    step={step}
                  />
                ))}

                <g
                  fill="rgba(255,255,255,0.38)"
                  className="font-mono"
                  fontSize="2.35"
                >
                  <text textAnchor="middle" x="63" y="49">
                    prepare
                  </text>
                  <text textAnchor="middle" x="127" y="49">
                    build
                  </text>
                  <text textAnchor="middle" x="191" y="49">
                    deliver
                  </text>
                </g>
              </svg>
              <div className="grid border-t border-white/10 text-center sm:grid-cols-3">
                {[
                  ["Durable", "Resume the run from anywhere"],
                  ["Isolated", "One workspace and branch per task"],
                  ["Reviewable", "Diff, tests, preview, and PR"],
                ].map(([title, body], index) => (
                  <div
                    className={`px-5 py-4 ${index > 0 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}
                    key={title}
                  >
                    <span className="text-xs font-medium text-white/90">
                      {title}
                    </span>
                    <span className="ml-2 text-[11px] text-white/45">
                      {body}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Stage>
        </div>
      </div>
    </section>
  );
}
