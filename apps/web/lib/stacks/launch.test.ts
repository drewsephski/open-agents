import { expect, test } from "bun:test";
import { toUserPreferencesData } from "@/lib/db/user-preferences";
import { buildDefaultStack } from "./default-stack";
import { freezeStackLaunch } from "./launch";
import { readStackSnapshot, stackConfigurationSchema } from "./schema";

test("freezes resolved models, variant options and skills independently of preferences", () => {
  const preferences = toUserPreferencesData();
  preferences.defaultModelId = "variant:mine";
  preferences.defaultSubagentModelId = "variant:mine";
  preferences.modelVariants = [
    {
      id: "variant:mine",
      name: "My model",
      baseModelId: "openai/gpt-6.1-sol",
      providerOptions: { reasoningEffort: "high" },
    },
  ];
  preferences.globalSkillRefs = [{ source: "vercel/ai", skillName: "ai-sdk" }];
  const configuration = buildDefaultStack(preferences, "launchstack_native");
  const snapshot = freezeStackLaunch({
    name: "Shipping",
    version: 2,
    configuration,
    hasRepository: true,
  });
  preferences.modelVariants[0]!.providerOptions.reasoningEffort = "low";
  preferences.globalSkillRefs.length = 0;
  configuration.instructions = "Changed tomorrow";
  expect(snapshot.configuration.model).toEqual({
    selectedId: "variant:mine",
    id: "openai/gpt-6.1-sol",
    providerOptionsOverrides: { openai: { reasoningEffort: "high" } },
  });
  expect(snapshot.configuration.subagentModel).toEqual(
    snapshot.configuration.model,
  );
  expect(snapshot.configuration.globalSkillRefs).toHaveLength(1);
  expect(snapshot.configuration.instructions).toBe("");
});

test("resolves run overrides without modifying the reusable version", () => {
  const configuration = buildDefaultStack(
    toUserPreferencesData(),
    "launchstack_native",
  );
  const snapshot = freezeStackLaunch({
    name: "Default",
    version: 1,
    configuration,
    hasRepository: true,
    missionType: "fix_bug",
    autoCommitPush: true,
    autoCreatePr: true,
  });
  expect(snapshot.configuration).toMatchObject({
    missionType: "fix_bug",
    autoCommitPush: true,
    autoCreatePr: true,
  });
  expect(configuration).toMatchObject({
    missionType: "ship_feature",
    autoCommitPush: false,
  });
  expect(
    freezeStackLaunch({
      name: "Default",
      version: 1,
      configuration,
      hasRepository: false,
      autoCommitPush: true,
      autoCreatePr: true,
    }).configuration,
  ).toMatchObject({
    missionType: "custom",
    autoCommitPush: false,
    autoCreatePr: false,
  });
});

test("rejects unsupported runtimes, capabilities, approval weakening, and mutable variants", () => {
  const configuration = buildDefaultStack(
    toUserPreferencesData(),
    "launchstack_native",
  );
  for (const patch of [
    { executionBackend: "opencode" },
    { sandboxType: "codesandbox" },
    { model: { id: "variant:mutable" } },
    { model: { id: "openai/gpt-6-pro" } },
    { autoCreatePr: true },
    {
      actions: {
        capabilities: [{ toolkit: "slack", access: "read_write" }],
        policy: configuration.actions.policy,
      },
    },
    {
      actions: {
        ...configuration.actions,
        policy: { ...configuration.actions.policy, write: "automatic" },
      },
    },
    { arbitraryTools: ["COMPOSIO_EXECUTE_TOOL"] },
  ])
    expect(
      stackConfigurationSchema.safeParse({ ...configuration, ...patch })
        .success,
    ).toBe(false);
  expect(readStackSnapshot(null)).toBeNull();
  expect(() => readStackSnapshot({ configuration: {} })).toThrow();
});

test("default Codex configuration represents its actual capability boundary", () => {
  const preferences = toUserPreferencesData();
  preferences.autoCommitPush = true;
  preferences.autoCreatePr = true;
  expect(buildDefaultStack(preferences, "codex")).toMatchObject({
    executionBackend: "codex",
    model: null,
    subagentModel: null,
    autoCommitPush: false,
    autoCreatePr: false,
    actions: { capabilities: [] },
  });
});
