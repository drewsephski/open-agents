import Link from "next/link";
import { POLICY_LINKS, STORE, SUPPORT_URL } from "@/lib/store-details";

export function PolicyLinks() {
  return (
    <nav
      aria-label="Pricing, policies, and support"
      className="space-y-3 text-sm"
    >
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {POLICY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="underline underline-offset-4"
          >
            {link.label}
          </Link>
        ))}
      </div>
      <a
        href={SUPPORT_URL}
        className="inline-block break-all underline underline-offset-4"
      >
        {STORE.supportEmail}
      </a>
    </nav>
  );
}
