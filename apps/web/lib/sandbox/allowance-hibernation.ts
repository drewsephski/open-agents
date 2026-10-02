import "server-only";

import { getSessionById, updateSession } from "@/lib/db/sessions";
import { releaseSandboxRunning } from "./allowance";
import { connectConfiguredSandbox } from "./connect";
import { buildHibernatedLifecycleUpdate } from "./lifecycle";
import {
  canOperateOnSandbox,
  clearSandboxState,
  isSandboxState,
} from "./utils";

export async function hibernateSandboxAfterAllowanceDenial(
  sessionId: string,
): Promise<void> {
  const session = await getSessionById(sessionId);
  const persistedState = session?.sandboxState;
  if (!session || !canOperateOnSandbox(persistedState)) return;

  const sandbox = await connectConfiguredSandbox(persistedState);
  await sandbox.stop();
  const stoppedState = sandbox.getState?.();
  await releaseSandboxRunning(sessionId);
  await updateSession(sessionId, {
    sandboxState: clearSandboxState(
      isSandboxState(stoppedState) ? stoppedState : persistedState,
    ),
    ...buildHibernatedLifecycleUpdate(),
  });
}
