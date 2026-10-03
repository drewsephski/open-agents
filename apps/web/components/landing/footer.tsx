import { STORE } from "@/lib/store-details";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function LandingFooter() {
  return (
    <footer className="mx-auto max-w-[1320px] border-t border-(--l-border)">
      <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-8 md:px-10">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-(--l-fg-2)">
            Cloud agents. Reviewable code.
          </p>
          <p className="text-xs text-(--l-fg-3)">
            Operated by {STORE.operator}, {STORE.country}.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </footer>
  );
}
