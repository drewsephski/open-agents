"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type ButtonSize = ComponentProps<typeof Button>["size"];

export function AuthButtons({ size }: { readonly size?: ButtonSize }) {
  const primaryLabel = size === "sm" ? "Sign up" : "Get started";

  return (
    <>
      <Button size={size} asChild>
        <Link href="/sign-up">{primaryLabel}</Link>
      </Button>
      <Button variant="ghost" size={size} asChild>
        <Link href="/sign-in">Sign in</Link>
      </Button>
    </>
  );
}
