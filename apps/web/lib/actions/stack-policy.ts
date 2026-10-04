import type { StackActions } from "@/lib/stacks/schema";
import { ACTION_IDS, ACTION_REGISTRY, isAction } from "./registry";

/** A Stack is a restriction, never an authority to expand the server registry. */
export function isStackActionAllowed(
  name: string,
  actions?: StackActions,
): boolean {
  if (!isAction(name)) return false;
  const action = ACTION_REGISTRY[name];
  // Legacy workers keep precisely the original Gmail surface, never new integrations.
  if (!actions) return action.toolkit === "gmail";
  const capability = actions.capabilities.find(
    (item) => item.toolkit === action.toolkit,
  );
  return Boolean(
    capability &&
    (action.behavior === "read" || capability.access === "read_write"),
  );
}

export function getStackActionIds(actions?: StackActions) {
  return ACTION_IDS.filter((name) =>
    isStackActionAllowed(name, actions),
  ).sort();
}
