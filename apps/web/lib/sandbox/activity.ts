import "server-only";

import { updateSession } from "@/lib/db/sessions";
import { meterSandboxRunning } from "./allowance";
import { buildLifecycleActivityUpdate } from "./lifecycle";

export async function recordSandboxActivity(
  sessionId: string,
  activityAt: Date = new Date(),
): Promise<void> {
  await Promise.all([
    meterSandboxRunning(sessionId),
    updateSession(sessionId, buildLifecycleActivityUpdate(activityAt)),
  ]);
}
