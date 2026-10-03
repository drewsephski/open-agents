import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { getAuthCallbackUrl } from "@/lib/auth/auth-href";
import { getSingleSearchParam } from "@/lib/redirect-safety";
import { getServerSession } from "@/lib/session/get-server-session";

export const metadata: Metadata = {
  title: "Sign in",
};

interface SignInPageProps {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const callbackUrl = getAuthCallbackUrl(
    getSingleSearchParam((await searchParams).next),
  );
  const session = await getServerSession();

  if (session?.user) {
    redirect(callbackUrl);
  }

  return <AuthScreen mode="sign-in" callbackUrl={callbackUrl} />;
}
