"use client";

import { usePathname } from "next/navigation";
import { useGitHubConnectionStatus } from "@/hooks/use-github-connection-status";
import { useSession } from "@/hooks/use-session";
import { POLICY_LINKS } from "@/lib/store-details";
import { GitHubReconnectDialog } from "./github-reconnect-dialog";

export function GitHubReconnectGate() {
  const pathname = usePathname();
  const { isAuthenticated, loading } = useSession();
  const { reconnectRequired, reason, isLoading } = useGitHubConnectionStatus({
    enabled: isAuthenticated,
  });

  if (
    loading ||
    !isAuthenticated ||
    isLoading ||
    !reconnectRequired ||
    POLICY_LINKS.some((link) => link.href === pathname) ||
    pathname === "/get-started" ||
    pathname === "/settings/connections"
  ) {
    return null;
  }

  return <GitHubReconnectDialog open reason={reason} />;
}
