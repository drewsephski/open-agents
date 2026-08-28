import { describe, expect, test } from "bun:test";
import {
  emailSignInSchema,
  emailSignUpSchema,
  getEmailAuthErrorMessage,
  getEmailSignupProfile,
} from "./email-password";

describe("email password helpers", () => {
  test("accepts a valid sign-in payload", () => {
    const result = emailSignInSchema.safeParse({
      email: " Drew@Example.com ",
      password: "secret",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("drew@example.com");
    }
  });

  test("rejects sign-up when passwords do not match", () => {
    const result = emailSignUpSchema.safeParse({
      email: "drew@example.com",
      password: "password12",
      confirmPassword: "password13",
    });

    expect(result.success).toBe(false);
  });

  test("rejects short passwords on sign-up", () => {
    const result = emailSignUpSchema.safeParse({
      email: "drew@example.com",
      password: "short",
      confirmPassword: "short",
    });

    expect(result.success).toBe(false);
  });

  test("derives name and username from the email local part", () => {
    expect(getEmailSignupProfile("Drew.Sepeczi@example.com")).toEqual({
      name: "Drew.Sepeczi",
      username: "drew.sepeczi",
    });
  });

  test("reads better-auth error messages", () => {
    expect(
      getEmailAuthErrorMessage({ message: "Invalid email or password" }),
    ).toBe("Invalid email or password");
    expect(getEmailAuthErrorMessage(null)).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
