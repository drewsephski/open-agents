"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getAuthPageHref } from "@/lib/auth/auth-href";
import { authClient } from "@/lib/auth/client";
import {
  emailSignInSchema,
  emailSignUpSchema,
  getEmailAuthErrorMessage,
  getEmailSignupProfile,
} from "@/lib/auth/email-password";

type EmailPasswordFormProps = {
  mode: "sign-in" | "sign-up";
  callbackUrl: string;
};

export function EmailPasswordForm({
  mode,
  callbackUrl,
}: EmailPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = isSignUp
      ? emailSignUpSchema.safeParse({ email, password, confirmPassword })
      : emailSignInSchema.safeParse({ email, password });

    if (!parsed.success) {
      const nextFieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string" && !nextFieldErrors[path]) {
          nextFieldErrors[path] = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const profile = getEmailSignupProfile(parsed.data.email);
        const { error } = await authClient.signUp.email({
          email: parsed.data.email,
          password: parsed.data.password,
          name: profile.name,
          username: profile.username,
          callbackURL: callbackUrl,
        });

        if (error) {
          setFormError(getEmailAuthErrorMessage(error));
          return;
        }
      } else {
        const { error } = await authClient.signIn.email({
          email: parsed.data.email,
          password: parsed.data.password,
          callbackURL: callbackUrl,
        });

        if (error) {
          setFormError(getEmailAuthErrorMessage(error));
          return;
        }
      }

      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      setFormError(getEmailAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup className="gap-3">
        <Field
          className="gap-1.5"
          data-invalid={fieldErrors.email ? true : undefined}
        >
          <FieldLabel htmlFor="email" className="text-[13px]">
            Email
          </FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            disabled={isSubmitting}
            className="h-9 text-sm"
          />
          <FieldError
            id="email-error"
            errors={
              fieldErrors.email ? [{ message: fieldErrors.email }] : undefined
            }
          />
        </Field>

        <Field
          className="gap-1.5"
          data-invalid={fieldErrors.password ? true : undefined}
        >
          <FieldLabel htmlFor="password" className="text-[13px]">
            Password
          </FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 8 characters" : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
            disabled={isSubmitting}
            className="h-9 text-sm"
          />
          <FieldError
            id="password-error"
            errors={
              fieldErrors.password
                ? [{ message: fieldErrors.password }]
                : undefined
            }
          />
        </Field>

        {isSignUp ? (
          <Field
            className="gap-1.5"
            data-invalid={fieldErrors.confirmPassword ? true : undefined}
          >
            <FieldLabel htmlFor="confirm-password" className="text-[13px]">
              Confirm password
            </FieldLabel>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? "confirm-password-error"
                  : undefined
              }
              disabled={isSubmitting}
              className="h-9 text-sm"
            />
            <FieldError
              id="confirm-password-error"
              errors={
                fieldErrors.confirmPassword
                  ? [{ message: fieldErrors.confirmPassword }]
                  : undefined
              }
            />
          </Field>
        ) : null}

        {formError ? (
          <p role="alert" className="text-destructive text-[13px] leading-snug">
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 h-9 w-full text-[13px] font-medium"
        >
          {isSubmitting
            ? isSignUp
              ? "Creating account..."
              : "Signing in..."
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export function AuthModeSwitch({ mode, callbackUrl }: EmailPasswordFormProps) {
  if (mode === "sign-in") {
    return (
      <p className="text-muted-foreground text-center text-[13px]">
        Don&apos;t have an account?{" "}
        <Link
          href={getAuthPageHref("/sign-up", callbackUrl)}
          className="text-foreground font-medium underline-offset-4 transition-colors hover:underline"
        >
          Sign up
        </Link>
      </p>
    );
  }

  return (
    <p className="text-muted-foreground text-center text-[13px]">
      Already have an account?{" "}
      <Link
        href={getAuthPageHref("/sign-in", callbackUrl)}
        className="text-foreground font-medium underline-offset-4 transition-colors hover:underline"
      >
        Sign in
      </Link>
    </p>
  );
}
