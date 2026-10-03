import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsSection, AccountsSectionSkeleton } from "../accounts-section";
import { VercelSection, VercelSectionSkeleton } from "../vercel-section";
import { GmailSection } from "./gmail-section";
import { OpenRouterCredentialPanel } from "@/components/openrouter-credential-panel";

import { CodexCredentialPanel } from "@/components/codex-credential-panel";

export const metadata: Metadata = {
  title: "Connections",
  description: "Manage your connected accounts and integrations.",
};

export default function ConnectionsPage() {
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-balance text-2xl font-semibold">Connections</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Manage provider credentials and source-control access.
        </p>
      </div>
      <CodexCredentialPanel />
      <OpenRouterCredentialPanel />
      <Suspense fallback={<VercelSectionSkeleton />}>
        <VercelSection />
      </Suspense>
      <Suspense fallback={<AccountsSectionSkeleton />}>
        <AccountsSection />
      </Suspense>
      <GmailSection />
    </>
  );
}
