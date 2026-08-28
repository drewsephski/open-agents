import Link from "next/link";
import { Logo } from "@/components/landing/logo";
import { SignInButton } from "@/components/auth/sign-in-button";
import {
  AuthModeSwitch,
  EmailPasswordForm,
} from "@/components/auth/email-password-form";

type AuthScreenProps = {
  mode: "sign-in" | "sign-up";
  callbackUrl: string;
};

export function AuthScreen({ mode, callbackUrl }: AuthScreenProps) {
  const isSignUp = mode === "sign-up";

  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.72_0.04_70/0.18),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.55_0.03_70/0.12),transparent_55%)]"
      />

      <header className="relative z-10 px-5 py-4">
        <Link
          href="/"
          className="inline-flex w-fit opacity-90 transition-opacity hover:opacity-100"
        >
          <Logo />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:items-center sm:px-6 sm:pb-16 sm:pt-0">
        <div className="w-full max-w-[360px]">
          <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_0_oklch(1_0_0/0.06)_inset,0_16px_48px_-20px_oklch(0_0_0/0.55)] sm:p-6">
            <div className="mb-5">
              <h1 className="text-lg font-semibold tracking-tight">
                {isSignUp ? "Create account" : "Welcome back"}
              </h1>
              <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                {isSignUp
                  ? "Email and password. No confirmation needed."
                  : "Sign in to continue to Launchstack."}
              </p>
            </div>

            <EmailPasswordForm mode={mode} callbackUrl={callbackUrl} />

            <div className="relative my-4">
              <div className="bg-border absolute inset-x-0 top-1/2 h-px" />
              <span className="bg-card text-muted-foreground relative mx-auto block w-fit px-2.5 text-[11px] font-medium uppercase tracking-[0.12em]">
                or
              </span>
            </div>

            <SignInButton
              className="h-9 w-full text-[13px]"
              variant="outline"
              callbackUrl={callbackUrl}
            >
              {isSignUp ? "Continue with Vercel" : "Sign in with Vercel"}
            </SignInButton>
          </div>

          <div className="mt-4">
            <AuthModeSwitch mode={mode} callbackUrl={callbackUrl} />
          </div>
        </div>
      </main>
    </div>
  );
}
