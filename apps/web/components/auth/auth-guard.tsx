"use client";

import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

export function AuthGuard({
  children,
  loadingFallback,
  unauthenticatedFallback,
}: {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
  unauthenticatedFallback?: React.ReactNode;
}) {
  const { loading, isAuthenticated } = useSession();

  if (loading) {
    return <>{loadingFallback ?? <div>Loading...</div>}</>;
  }

  if (!isAuthenticated) {
    return (
      <>
        {unauthenticatedFallback ?? (
          <div className="flex flex-col items-center gap-4 p-8">
            <p>Please sign in to continue</p>
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
