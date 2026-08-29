import "server-only";

import { updateSession } from "@/lib/db/sessions";
import { meterSandboxRunning, SandboxAccessDeniedError } from "./allowance";
import { hibernateSandboxAfterAllowanceDenial } from "./allowance-hibernation";
import { buildLifecycleActivityUpdate } from "./lifecycle";

export async function recordSandboxActivity(
  sessionId: string,
  activityAt: Date = new Date(),
): Promise<void> {
  try {
    await meterSandboxRunning(sessionId);
  } catch (error) {
    if (error instanceof SandboxAccessDeniedError) {
      await hibernateSandboxAfterAllowanceDenial(sessionId);
    }
    throw error;
  }
  await updateSession(sessionId, buildLifecycleActivityUpdate(activityAt));
}
