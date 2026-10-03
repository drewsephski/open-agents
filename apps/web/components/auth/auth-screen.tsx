import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthProductPreview } from "@/components/auth/auth-product-preview";
import { Logo } from "@/components/landing/logo";
import { ThemeToggle } from "@/components/landing/theme-toggle";
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
    <div className="landing min-h-dvh bg-(--l-bg) text-(--l-fg)">
      <header className="mx-auto flex h-16 max-w-[1320px] items-center justify-between border-x border-(--l-border) px-5 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-70">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="hidden items-center gap-1.5 font-mono text-[11px] text-(--l-fg-3) transition-colors hover:text-(--l-fg) sm:flex"
          >
            <ArrowLeft className="size-3" />
            Back to home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1320px] border-x border-t border-(--l-border) lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <section className="hidden border-r border-(--l-border) p-4 lg:block xl:p-6">
          <AuthProductPreview />
        </section>

        <section className="relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-10 lg:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--l-border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--l-border-subtle)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
          />
          <div className="relative w-full max-w-[390px]">
            <div className="mb-8">
              <div className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-(--l-fg-3)">
                <span className="size-1.5 rounded-full bg-(--l-accent)" />
                {isSignUp ? "Initialize workspace" : "Resume your workspace"}
              </div>
              <h1 className="text-[30px] font-medium leading-none tracking-[-0.04em] sm:text-[34px]">
                {isSignUp ? "Create account" : "Welcome back"}
              </h1>
              <p className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-(--l-fg-3)">
                {isSignUp
                  ? "Create your account and start shipping from an isolated cloud workspace."
                  : "Sign in to pick up where your agents left off."}
              </p>
            </div>

            <div className="border-y border-(--l-border) py-6">
              <EmailPasswordForm mode={mode} callbackUrl={callbackUrl} />

              <div className="relative my-5">
                <div className="absolute inset-x-0 top-1/2 h-px bg-(--l-border)" />
                <span className="relative mx-auto block w-fit bg-(--l-bg) px-3 font-mono text-[9px] uppercase tracking-[0.18em] text-(--l-fg-4)">
                  or continue with
                </span>
              </div>

              <SignInButton
                className="h-11 w-full rounded-md border-(--l-border) bg-(--l-surface) text-[13px] text-(--l-fg) shadow-none hover:bg-(--l-surface-3) hover:text-(--l-fg) dark:bg-(--l-surface) dark:hover:bg-(--l-surface-3)"
                variant="outline"
                callbackUrl={callbackUrl}
              >
                {isSignUp ? "Continue with Vercel" : "Sign in with Vercel"}
              </SignInButton>
            </div>

            <div className="mt-5">
              <AuthModeSwitch mode={mode} callbackUrl={callbackUrl} />
            </div>
            <p className="mt-8 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-(--l-fg-4)">
              Secure sessions · encrypted credentials
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
