import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import {
  getSingleSearchParam,
  sanitizeInternalRedirect,
} from "@/lib/redirect-safety";
import { getServerSession } from "@/lib/session/get-server-session";

export const metadata: Metadata = {
  title: "Sign up",
};

interface SignUpPageProps {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const callbackUrl = sanitizeInternalRedirect(
    getSingleSearchParam((await searchParams).next),
    "/sessions",
  );
  const session = await getServerSession();

  if (session?.user) {
    redirect(callbackUrl);
  }

  return <AuthScreen mode="sign-up" callbackUrl={callbackUrl} />;
}
