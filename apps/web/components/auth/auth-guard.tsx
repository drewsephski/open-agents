"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { getAuthPageHref } from "@/lib/auth/auth-href";

export function AuthGuard({
  children,
  loadingFallback,
}: {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, isAuthenticated, session } = useSession();

  useEffect(() => {
    if (!loading && session && !isAuthenticated) {
      const { pathname, search, hash } = window.location;
      router.replace(
        getAuthPageHref("/sign-in", `${pathname}${search}${hash}`),
      );
    }
  }, [loading, session, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return <>{loadingFallback ?? <div>Loading...</div>}</>;
  }

  return <>{children}</>;
}
