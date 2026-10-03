import type { ReactNode } from "react";
import { requireServerSession } from "@/lib/session/require-server-session";
import SettingsLayout from "./settings-layout";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireServerSession("/settings/profile");
  return <SettingsLayout>{children}</SettingsLayout>;
}
