import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Launchstack account settings.",
};

export default function SettingsPage() {
  redirect("/settings/profile");
}
