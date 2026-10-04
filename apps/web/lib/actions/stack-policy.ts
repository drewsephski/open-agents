import type { StackActions } from "@/lib/stacks/schema";
import { GMAIL_ACTIONS, isGmailAction } from "./gmail-policy";

/** A Stack is a restriction, never an authority to expand the server registry. */
export function isStackActionAllowed(
  name: string,
  actions?: StackActions,
): boolean {
  if (!isGmailAction(name)) return false;
  if (!actions) return true; // Legacy sessions retain their existing surface.
  const gmail = actions.capabilities.find(
    (capability) => capability.toolkit === "gmail",
  );
  return Boolean(
    gmail && (!GMAIL_ACTIONS[name].mutating || gmail.access === "read_write"),
  );
}
