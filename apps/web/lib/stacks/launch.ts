import { resolveNewSessionMissionType, type MissionType } from "@/lib/missions";
import {
  stackSnapshotSchema,
  type StackSnapshot,
  type StackConfiguration,
} from "./schema";

/** Resolve run overrides once. No preferences or Stack lookups during execution. */
export function freezeStackLaunch(params: {
  name: string;
  version: number;
  configuration: StackConfiguration;
  hasRepository: boolean;
  missionType?: MissionType;
  autoCommitPush?: boolean;
  autoCreatePr?: boolean;
}): StackSnapshot {
  const configuration = structuredClone(params.configuration);
  configuration.missionType = resolveNewSessionMissionType({
    hasRepository: params.hasRepository,
    missionType: params.missionType ?? configuration.missionType,
  });
  configuration.autoCommitPush =
    params.hasRepository &&
    (params.autoCommitPush ?? configuration.autoCommitPush);
  configuration.autoCreatePr =
    configuration.autoCommitPush &&
    (params.autoCreatePr ?? configuration.autoCreatePr);
  // Codex's existing workflow has no automatic commit/PR stage.
  if (configuration.executionBackend === "codex") {
    configuration.autoCommitPush = false;
    configuration.autoCreatePr = false;
  }
  return stackSnapshotSchema.parse({
    name: params.name,
    version: params.version,
    configuration,
  });
}
