import { expect, test } from "bun:test";
import { calculateLaunchReadiness } from "./readiness";
import { buildDefaultStack } from "./default-stack";
import { toUserPreferencesData } from "@/lib/db/user-preferences";
import type { ActionProvider } from "@/lib/actions/provider";
import {
  actionBindingsSchema,
  validateActionAccounts,
} from "@/lib/actions/bindings";

const configuration = buildDefaultStack(
  toUserPreferencesData(),
  "launchstack_native",
);
configuration.actions.capabilities = [
  { toolkit: "gmail", access: "read_write" },
  { toolkit: "linear", access: "read" },
];
function provider(
  accounts: Partial<Record<"gmail" | "linear", string[]>>,
): ActionProvider {
  return {
    id: "composio",
    listAccounts: async (_user, toolkit) =>
      (accounts[toolkit] ?? []).map((accountId) => ({
        accountId,
        label: accountId,
      })),
    createSession: async () => {
      throw new Error("Readiness must not create runtime sessions");
    },
    createConnectionSession: async () => {
      throw new Error("Readiness must not create connection sessions");
    },
    deleteSession: async () => {},
    connect: async () => "",
    getTools: async () => ({}),
  };
}
const check = (p?: ActionProvider, accountIds?: unknown) =>
  calculateLaunchReadiness({
    userId: "user-1",
    configuration,
    provider: p,
    accountIds,
    checkPrerequisites: async () => [],
  });

test("ready Stack binds exactly all required accounts without runtime creation", async () => {
  const result = await check(
    provider({ gmail: ["ca-gmail"], linear: ["ca-linear"] }),
  );
  expect(result.ready).toBe(true);
  expect(result.bindings).toEqual({
    gmail: { accountId: "ca-gmail", label: "ca-gmail" },
    linear: { accountId: "ca-linear", label: "ca-linear" },
  });
});
for (const missing of ["gmail", "linear"] as const) {
  test(`missing ${missing} blocks launch without dropping the capability`, async () => {
    const result = await check(
      provider({ [missing === "gmail" ? "linear" : "gmail"]: ["ca-active"] }),
    );
    expect(result.ready).toBe(false);
    expect(result.blockers).toMatchObject([
      { code: "connection_required", toolkit: missing },
    ]);
    expect(result.requirements).toHaveLength(2);
  });
}
test("deployment without Composio blocks required actions", async () => {
  const result = await check();
  expect(result.ready).toBe(false);
  expect(result.blockers.map((b) => b.code)).toEqual([
    "integration_unavailable",
    "integration_unavailable",
  ]);
});
test("multiple accounts require intentional selection, and new Sessions can select another identity", async () => {
  const p = provider({ gmail: ["ca-a", "ca-b"], linear: ["ca-linear"] });
  expect((await check(p)).blockers[0]?.code).toBe("account_selection_required");
  const old = await check(p, { gmail: "ca-a" });
  const next = await check(p, { gmail: "ca-b" });
  expect(old.ready && next.ready).toBe(true);
  expect(old.bindings.gmail?.accountId).toBe("ca-a");
  expect(next.bindings.gmail?.accountId).toBe("ca-b");
  expect((await check(p, { gmail: "ca-unknown" })).blockers[0]?.code).toBe(
    "account_unavailable",
  );
});
test("revocation after readiness fails closed even when a replacement account is active", async () => {
  const accounts = { gmail: ["ca-a"], linear: ["ca-linear"] };
  const p = provider(accounts);
  const launch = await check(p);
  const scope = {
    tools: ["GMAIL_FETCH_EMAILS" as const],
    connectedAccounts: { gmail: launch.bindings.gmail!.accountId },
  };
  accounts.gmail = ["ca-b"];
  await expect(validateActionAccounts(p, "user-1", scope)).rejects.toThrow(
    "bound to Gmail account ca-a",
  );
  expect(launch.bindings.gmail?.accountId).toBe("ca-a");
});
test("metadata is projected and credentials cannot enter bindings", async () => {
  const p = provider({ gmail: [], linear: ["ca-linear"] });
  p.listAccounts = async () => [
    {
      accountId: "ca-safe",
      label: "safe",
      accessToken: "secret",
      data: { refresh_token: "secret" },
    },
  ];
  const result = await check(p);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(
    actionBindingsSchema.safeParse({
      gmail: { accountId: "ca-safe", label: "safe", token: "secret" },
    }).success,
  ).toBe(false);
});
test("unknown toolkit and malformed account IDs fail closed", async () => {
  await expect(check(provider({}), { slack: "ca-1" })).rejects.toThrow();
  await expect(
    check(provider({}), { gmail: "https://secret" }),
  ).rejects.toThrow();
});
test("provider failures and existing access-policy blockers remain blockers", async () => {
  const p = provider({});
  p.listAccounts = async () => {
    throw new Error("credential-secret");
  };
  const result = await calculateLaunchReadiness({
    userId: "user",
    configuration,
    provider: p,
    checkPrerequisites: async () => [
      {
        code: "inference_unavailable",
        label: "Connect inference",
        remediation: "/settings/connections",
      },
    ],
  });
  expect(result.ready).toBe(false);
  expect(result.blockers[0]?.code).toBe("inference_unavailable");
  expect(result.blockers[1]?.code).toBe("provider_unavailable");
  expect(JSON.stringify(result)).not.toContain("credential-secret");
});
