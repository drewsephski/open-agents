"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

export async function signOut(): Promise<void> {
  // Signing out ends this app session; linked accounts also serve other
  // sessions and background tasks, so retain their OAuth credentials.
  await auth.api.signOut({ headers: await headers() });

  redirect("/sign-in");
}
