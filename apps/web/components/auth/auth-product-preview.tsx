import { ArrowUpRight, Check, GitBranch } from "lucide-react";

const activity = [
  ["read", "app/api/auth/route.ts"],
  ["edit", "lib/session.ts"],
  ["test", "pnpm run ci"],
] as const;

export function AuthProductPreview() {
  return (
    <div className="relative flex h-full min-h-[460px] flex-col overflow-hidden border border-(--l-border) bg-(--l-stage-iron-bg) shadow-[var(--l-stage-iron-shadow)]">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundImage: "var(--l-stage-iron-img)" }}
      />
      <div className="grain pointer-events-none absolute inset-0 opacity-70" />

      <div className="relative flex items-center justify-between border-b border-black/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-black/55">
        <span>Cloud workspace</span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#ff8a3d]" />
          Live
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center p-5 sm:p-8 lg:p-10">
        <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-(--l-panel-border) bg-(--l-panel) shadow-[var(--l-window-shadow)] ring-1 ring-(--l-panel-border)">
          <div className="flex items-center justify-between border-b border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px] text-(--l-panel-fg-2)">
              <span className="size-1.5 rounded-full bg-(--l-accent)" />
              launchstack / feat/auth-flow
            </div>
            <GitBranch className="size-3.5 text-(--l-panel-fg-3)" />
          </div>

          <div className="bg-(--l-code-bg) px-4 py-5 font-mono text-[11px] leading-6 sm:px-6 sm:py-7 sm:text-[12px]">
            <p className="text-(--l-panel-fg-2)">
              &gt; build a secure, production-ready auth flow
            </p>
            <p className="mt-1 text-(--l-panel-fg-4)">
              sandbox: vercel (feat/auth-flow)
            </p>

            <div className="mt-5 space-y-1">
              {activity.map(([action, file]) => (
                <div key={file} className="flex items-center gap-3">
                  <Check className="size-3 text-(--l-panel-fg-3)" />
                  <span className="w-9 text-(--l-panel-fg-4)">{action}</span>
                  <span className="text-(--l-panel-fg)">{file}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-(--l-panel-border) pt-4 text-(--l-panel-fg-2)">
              Auth flow is live. Session middleware, provider callback,
              <br className="hidden sm:block" /> and validation all pass clean.
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2 font-mono text-[10px] text-(--l-panel-fg-3)">
            <span>3 files changed</span>
            <span className="flex items-center gap-1 text-(--l-panel-fg-2)">
              Ready to ship <ArrowUpRight className="size-3" />
            </span>
          </div>
        </div>
      </div>

      <p className="relative px-4 pb-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-black/45">
        Isolated sandboxes · durable workflows · automatic deploys
      </p>
    </div>
  );
}
