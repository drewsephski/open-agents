import { expect, test } from "bun:test";
import {
  ACTION_IDS,
  ACTION_REGISTRY,
  actionCapabilitySchema,
  actionIdSchema,
  actionToolkitSchema,
  requiresActionApproval,
} from "./registry";
import { stackActionsSchema } from "@/lib/stacks/schema";
import { getStackActionIds, isStackActionAllowed } from "./stack-policy";
import { actionExecutionScopeSchema, actionScopeKey } from "./scope";

const policy = {
  read: "automatic",
  write: "approval",
  destructive: "denied",
} as const;
test("the registry and capability schema reject unknown or widened authority", () => {
  for (const name of [
    "COMPOSIO_MULTI_EXECUTE_TOOL",
    "GMAIL_DELETE_MESSAGE",
    "LINEAR_RUN_QUERY_OR_MUTATION",
    "toString",
  ]) {
    expect(actionIdSchema.safeParse(name).success).toBe(false);
    expect(isStackActionAllowed(name)).toBe(false);
  }
  expect(actionToolkitSchema.safeParse("slack").success).toBe(false);
  for (const capability of [
    { toolkit: "linear", access: "read_write" },
    { toolkit: "gmail", access: "destructive" },
    { toolkit: "gmail", access: "read", tools: ["GMAIL_SEND_EMAIL"] },
    { toolkit: "slack", access: "read" },
  ])
    expect(actionCapabilitySchema.safeParse(capability).success).toBe(false);
  expect(
    stackActionsSchema.safeParse({
      capabilities: [
        { toolkit: "gmail", access: "read" },
        { toolkit: "gmail", access: "read_write" },
      ],
      policy,
    }).success,
  ).toBe(false);
  for (const override of [
    { read: "approval" },
    { write: "automatic" },
    { destructive: "approval" },
  ])
    expect(
      stackActionsSchema.safeParse({
        capabilities: [],
        policy: { ...policy, ...override },
      }).success,
    ).toBe(false);
});
test("capabilities expose exactly registered tools with fixed approval policies", () => {
  expect(getStackActionIds({ capabilities: [], policy })).toEqual([]);
  const gmail = getStackActionIds({
    capabilities: [{ toolkit: "gmail", access: "read" }],
    policy,
  });
  expect(gmail).toEqual([
    "GMAIL_FETCH_EMAILS",
    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
  ]);
  expect(gmail.some(requiresActionApproval)).toBe(false);
  const fullGmail = getStackActionIds({
    capabilities: [{ toolkit: "gmail", access: "read_write" }],
    policy,
  });
  expect(fullGmail).toHaveLength(4);
  expect(fullGmail.filter(requiresActionApproval)).toEqual([
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GMAIL_SEND_EMAIL",
  ]);
  expect(getStackActionIds()).toEqual(fullGmail);
  const linear = getStackActionIds({
    capabilities: [{ toolkit: "linear", access: "read" }],
    policy,
  });
  expect(linear).toEqual(["LINEAR_GET_LINEAR_ISSUE", "LINEAR_SEARCH_ISSUES"]);
  expect(
    linear.every((name) => ACTION_REGISTRY[name].behavior === "read"),
  ).toBe(true);
  expect(ACTION_IDS).toHaveLength(6);
});
test("runtime scope validation is closed and identity includes exact tools and accounts", () => {
  const scope = {
    tools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"],
    connectedAccounts: { gmail: "ca-1" },
  } as const;
  const parsed = actionExecutionScopeSchema.parse(scope);
  expect(actionScopeKey(parsed)).toBe(
    actionScopeKey({ ...parsed, tools: [...parsed.tools].toReversed() }),
  );
  expect(actionScopeKey(parsed)).not.toBe(
    actionScopeKey({ ...parsed, tools: ["GMAIL_FETCH_EMAILS"] }),
  );
  expect(actionScopeKey(parsed)).not.toBe(
    actionScopeKey({ ...parsed, connectedAccounts: { gmail: "ca-2" } }),
  );
  for (const value of [
    { ...scope, tools: ["GMAIL_DELETE_MESSAGE"] },
    { ...scope, tools: ["GMAIL_SEND_EMAIL", "GMAIL_SEND_EMAIL"] },
    { ...scope, connectedAccounts: {} },
    {
      ...scope,
      connectedAccounts: { ...scope.connectedAccounts, linear: "ca-2" },
    },
    { ...scope, connectedAccounts: { slack: "ca-3" } },
  ])
    expect(actionExecutionScopeSchema.safeParse(value).success).toBe(false);
});
