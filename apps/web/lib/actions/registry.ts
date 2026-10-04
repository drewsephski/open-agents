import { z } from "zod";

export const actionToolkitSchema = z.enum(["gmail", "linear"]);
export type ActionToolkit = z.infer<typeof actionToolkitSchema>;

export const ACTION_TOOLKITS = {
  gmail: {
    label: "Gmail",
    description:
      "Read emails and prepare replies. Drafts and sends require your approval.",
  },
  linear: {
    label: "Linear",
    description:
      "Search issues and read issue details. No issue changes or comments.",
  },
} as const satisfies Record<
  ActionToolkit,
  { label: string; description: string }
>;

/** Server-owned authority. No catalog discovery, proxy, or meta execution tools. */
export const ACTION_REGISTRY = {
  GMAIL_FETCH_EMAILS: {
    toolkit: "gmail",
    label: "Fetch Gmail emails",
    behavior: "read",
    provider: "composio",
  },
  GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: {
    toolkit: "gmail",
    label: "Read Gmail email",
    behavior: "read",
    provider: "composio",
  },
  GMAIL_CREATE_EMAIL_DRAFT: {
    toolkit: "gmail",
    label: "Create Gmail draft",
    behavior: "write",
    provider: "composio",
  },
  GMAIL_SEND_EMAIL: {
    toolkit: "gmail",
    label: "Send Gmail email",
    behavior: "write",
    provider: "composio",
  },
  LINEAR_SEARCH_ISSUES: {
    toolkit: "linear",
    label: "Search Linear issues",
    behavior: "read",
    provider: "composio",
  },
  LINEAR_GET_LINEAR_ISSUE: {
    toolkit: "linear",
    label: "Read Linear issue",
    behavior: "read",
    provider: "composio",
  },
} as const satisfies Record<
  string,
  {
    toolkit: ActionToolkit;
    label: string;
    behavior: "read" | "write";
    provider: "composio";
  }
>;
export type ActionId = keyof typeof ACTION_REGISTRY;
export const ACTION_IDS = Object.keys(ACTION_REGISTRY) as ActionId[];
export const actionIdSchema = z.enum(ACTION_IDS as [ActionId, ...ActionId[]]);

export function isAction(name: string): name is ActionId {
  return Object.hasOwn(ACTION_REGISTRY, name);
}
export function requiresActionApproval(name: string): boolean {
  return isAction(name) && ACTION_REGISTRY[name].behavior === "write";
}

export const actionCapabilitySchema = z.discriminatedUnion("toolkit", [
  z.strictObject({
    toolkit: z.literal("gmail"),
    access: z.enum(["read", "read_write"]),
  }),
  z.strictObject({ toolkit: z.literal("linear"), access: z.literal("read") }),
]);
export const actionCapabilitiesSchema = z
  .array(actionCapabilitySchema)
  .max(2)
  .refine(
    (capabilities) =>
      new Set(capabilities.map((capability) => capability.toolkit)).size ===
      capabilities.length,
    "Only one capability level per toolkit is allowed",
  );
