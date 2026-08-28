import { z } from "zod";
import { deriveAuthUsername } from "./username";

export const EMAIL_AUTH_MIN_PASSWORD_LENGTH = 8;

export const emailAuthEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const emailAuthPasswordSchema = z
  .string()
  .min(
    EMAIL_AUTH_MIN_PASSWORD_LENGTH,
    `Password must be at least ${EMAIL_AUTH_MIN_PASSWORD_LENGTH} characters`,
  );

export const emailSignInSchema = z.object({
  email: emailAuthEmailSchema,
  password: z.string().min(1, "Password is required"),
});

export const emailSignUpSchema = z
  .object({
    email: emailAuthEmailSchema,
    password: emailAuthPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type EmailSignInInput = z.infer<typeof emailSignInSchema>;
export type EmailSignUpInput = z.infer<typeof emailSignUpSchema>;

export function getEmailSignupProfile(email: string): {
  name: string;
  username: string;
} {
  const username = deriveAuthUsername({ email });
  const localPart = email.split("@", 1)[0]?.trim();

  return {
    name: localPart || username,
    username,
  };
}

export function getEmailAuthErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
