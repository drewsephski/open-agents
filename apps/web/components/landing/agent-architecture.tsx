const paths = [
  "M 10 20 h 79.5 q 5 0 5 5 v 30",
  "M 190 10 h -79.7 q -5 0 -5 5 v 30",
  "M 130 20 v 21.8 q 0 5 -5 5 h -10",
  "M 180 80 v -21.8 q 0 -5 -5 -5 h -60",
  "M 135 65 h 20 q 5 0 5 5 v 10 q 0 5 -5 5 h -44.8 q -5 0 -5 -5 v -20",
  "M 94.8 95 v -36",
  "M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 9",
  "M 20 30 h 35 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20",
] as const;

const nodes = [
  { x: 10, y: 20, label: "REPO", anchor: "start" },
  { x: 190, y: 10, label: "BRANCH", anchor: "end" },
  { x: 130, y: 20, label: "AGENT", anchor: "middle" },
  { x: 180, y: 80, label: "PREVIEW", anchor: "end" },
  { x: 160, y: 85, label: "PULL REQUEST", anchor: "start" },
  { x: 94.8, y: 95, label: "TESTS", anchor: "middle" },
  { x: 88, y: 88, label: "TOOLS", anchor: "middle" },
  { x: 20, y: 30, label: "SANDBOX", anchor: "start" },
] as const;

const colors = [
  ["#00e8ed", "#0088ff"],
  ["#ffd800", "#f59e0b"],
  ["#830cd1", "#ff008b"],
  ["#ffffff", "#a3a3a3"],
  ["#22c55e", "#16a34a"],
  ["#f97316", "#ea580c"],
  ["#06b6d4", "#0891b2"],
  ["#f43f5e", "#e11d48"],
] as const;

export function AgentArchitecture() {
  return (
    <section className="border-y border-(--l-border-subtle)">
      <div className="mx-auto grid max-w-[1320px] md:grid-cols-[0.72fr_1.28fr]">
        <div className="flex flex-col justify-center border-b border-(--l-border) px-6 py-14 sm:px-10 md:border-b-0 md:border-r md:py-20 lg:py-24">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-(--l-fg-4)">
            One connected workspace
          </span>
          <h2 className="mt-5 max-w-md text-balance text-3xl font-semibold leading-[1.06] tracking-tighter sm:text-4xl md:text-5xl">
            The whole task moves together.
          </h2>
          <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-(--l-fg-2)">
            Code, tools, tests, previews, and pull requests stay connected to
            one durable agent run—not scattered across terminals and tabs.
          </p>
        </div>

        <div className="relative flex min-h-[340px] items-center overflow-hidden bg-(--l-surface-2) px-2 py-12 sm:min-h-[430px] sm:px-8 md:py-16">
          <div
            className="pointer-events-none absolute inset-0 opacity-45"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(var(--l-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--l-border-subtle) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage:
                "radial-gradient(ellipse at center, black 20%, transparent 72%)",
            }}
          />
          <svg
            aria-label="Launchstack workflow architecture connecting a repository to an agent, cloud sandbox, tests, preview, and pull request"
            className="relative h-auto w-full text-(--l-fg-4)"
            role="img"
            viewBox="0 0 200 100"
          >
            <title>Launchstack connected agent workflow</title>
            <defs>
              {paths.map((path, index) => (
                <mask id={`agent-path-mask-${index}`} key={path}>
                  <path
                    d={path}
                    fill="none"
                    stroke="white"
                    strokeWidth="0.65"
                  />
                </mask>
              ))}
              {colors.map(([start, end], index) => (
                <radialGradient id={`agent-glow-${index}`} key={start} fx="1">
                  <stop offset="0%" stopColor={start} />
                  <stop offset="48%" stopColor={end} />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              ))}
              <linearGradient id="agent-chip" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#27272a" />
                <stop offset="1" stopColor="#111113" />
              </linearGradient>
              <linearGradient id="agent-chip-text" x1="0" x2="1">
                <stop offset="0" stopColor="#8a8a8a" />
                <stop offset="0.5" stopColor="#ffffff" />
                <stop offset="1" stopColor="#8a8a8a" />
              </linearGradient>
              <filter
                id="agent-chip-shadow"
                height="180%"
                width="140%"
                x="-20%"
                y="-40%"
              >
                <feDropShadow
                  dx="0"
                  dy="1.5"
                  floodColor="#000000"
                  floodOpacity="0.28"
                  stdDeviation="1.4"
                />
              </filter>
            </defs>

            <g
              className="agent-architecture-paths"
              fill="none"
              stroke="currentColor"
            >
              {paths.map((path) => (
                <path d={path} key={path} pathLength="100" strokeWidth="0.35" />
              ))}
            </g>

            {paths.map((_, index) => (
              <g key={colors[index][0]} mask={`url(#agent-path-mask-${index})`}>
                <circle
                  className={`agent-architecture-glow agent-architecture-glow-${index + 1}`}
                  cx="0"
                  cy="0"
                  fill={`url(#agent-glow-${index})`}
                  r="8"
                />
              </g>
            ))}

            <g fill="currentColor">
              {nodes.map((node, index) => (
                <g key={node.label}>
                  <circle cx={node.x} cy={node.y} r="1.1" />
                  <text
                    className="fill-(--l-fg-3) font-mono"
                    fontSize="2.5"
                    letterSpacing="0.12em"
                    textAnchor={node.anchor}
                    x={node.x}
                    y={index === 4 ? node.y + 5 : node.y - 3.4}
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </g>

            <g fill="url(#agent-chip-text)">
              <rect height="5" rx="0.7" width="2.5" x="93" y="37" />
              <rect height="5" rx="0.7" width="2.5" x="104" y="37" />
              <rect height="2.5" rx="0.7" width="5" x="116" y="44" />
              <rect height="2.5" rx="0.7" width="5" x="116" y="53" />
              <rect height="5" rx="0.7" width="2.5" x="93" y="58" />
              <rect height="5" rx="0.7" width="2.5" x="104" y="58" />
              <rect height="2.5" rx="0.7" width="5" x="80" y="44" />
              <rect height="2.5" rx="0.7" width="5" x="80" y="53" />
            </g>
            <rect
              fill="url(#agent-chip)"
              filter="url(#agent-chip-shadow)"
              height="20"
              rx="2"
              width="30"
              x="85"
              y="40"
            />
            <text
              fill="url(#agent-chip-text)"
              fontSize="5.2"
              fontWeight="600"
              letterSpacing="0.02em"
              textAnchor="middle"
              x="100"
              y="52"
            >
              launch
            </text>
          </svg>
        </div>
      </div>
    </section>
  );
}
