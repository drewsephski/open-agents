import Link from "next/link";
import { STORE } from "@/lib/store-details";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing min-h-dvh bg-(--l-bg) text-(--l-fg)">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-b border-(--l-border) px-6 py-6">
        <Link href="/" className="font-semibold">
          {STORE.name}
        </Link>
        <nav aria-label="Public navigation" className="flex gap-6 text-sm">
          <Link href="/pricing" className="underline underline-offset-4">
            Pricing
          </Link>
          <Link href="/support" className="underline underline-offset-4">
            Support
          </Link>
        </nav>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-3xl space-y-8 px-6 py-12 [&_h1]:text-balance [&_h1]:text-4xl [&_h1]:font-semibold [&_h2]:text-balance [&_h2]:text-xl [&_h2]:font-semibold [&_p]:text-pretty [&_p]:leading-relaxed [&_section]:space-y-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_a]:underline [&_a]:underline-offset-4"
      >
        {children}
      </main>
      <footer className="mx-auto max-w-5xl space-y-4 border-t border-(--l-border) px-6 py-8">
        <p className="text-pretty text-sm text-(--l-fg-2)">
          {STORE.name} is operated by {STORE.operator}, {STORE.country}.
        </p>
      </footer>
    </div>
  );
}
