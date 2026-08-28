import { describe, expect, test } from "bun:test";
import type { UserPreferencesData } from "@/lib/db/user-preferences";
import type { ModelVariant } from "@/lib/model-variants";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import {
  filterModelsForSession,
  filterModelVariantsForSession,
  sanitizeSelectedModelIdForSession,
  sanitizeUserPreferencesForSession,
} from "./model-access";

const managedTrialSession = {
  authProvider: "vercel" as const,
  user: {
    id: "user-1",
    username: "alice",
    email: "alice@example.com",
    avatar: "",
  },
};

const vercelSession = {
  authProvider: "vercel" as const,
  user: {
    id: "user-2",
    username: "vercel-user",
    email: "dev@vercel.com",
    avatar: "",
  },
};

const requestUrl = "https://open-agents.dev/api/test";

const userOpusVariant: ModelVariant = {
  id: "variant:user-opus",
  name: "User Opus",
  baseModelId: "anthropic/claude-opus-4.6",
  providerOptions: { effort: "high" },
};

const userFableVariant: ModelVariant = {
  id: "variant:user-fable",
  name: "User Fable",
  baseModelId: "anthropic/claude-fable-5",
  providerOptions: { effort: "high" },
};

const basePreferences: UserPreferencesData = {
  defaultModelId: "anthropic/claude-fable-5",
  defaultSubagentModelId: "variant:builtin:claude-fable-5-high",
  defaultSandboxType: "vercel",
  defaultDiffMode: "unified",
  autoCommitPush: false,
  autoCreatePr: false,
  alertsEnabled: true,
  alertSoundEnabled: true,
  publicUsageEnabled: false,
  globalSkillRefs: [],
  modelVariants: [userOpusVariant, userFableVariant],
  enabledModelIds: [
    "anthropic/claude-opus-4.6",
    "anthropic/claude-fable-5",
    "openai/gpt-5",
  ],
};

describe("model access gating", () => {
  test("filters Claude Opus and Fable base models for managed trial users", () => {
    const result = filterModelsForSession(
      [
        { id: "anthropic/claude-opus-4.6" },
        { id: "anthropic/claude-fable-5" },
        { id: "anthropic/claude-haiku-4.5" },
      ],
      managedTrialSession,
      requestUrl,
    );

    expect(result).toEqual([{ id: "anthropic/claude-haiku-4.5" }]);
  });

  test("filters Opus- and Fable-backed variants for managed trial users", () => {
    const result = filterModelVariantsForSession(
      [
        userOpusVariant,
        userFableVariant,
        {
          id: "variant:user-gpt",
          name: "User GPT",
          baseModelId: "openai/gpt-5",
          providerOptions: {},
        },
      ],
      managedTrialSession,
      requestUrl,
    );

    expect(result.map((variant) => variant.id)).toEqual(["variant:user-gpt"]);
  });

  test("falls back to the app default when a managed trial user selects a Fable variant", () => {
    const result = sanitizeSelectedModelIdForSession(
      "variant:builtin:claude-fable-5-high",
      [userFableVariant],
      managedTrialSession,
      requestUrl,
    );

    expect(result).toBe(APP_DEFAULT_MODEL_ID);
  });

  test("sanitizes managed trial preferences without mutating the database shape", () => {
    const result = sanitizeUserPreferencesForSession(
      basePreferences,
      managedTrialSession,
      requestUrl,
    );

    expect(result).toMatchObject({
      defaultModelId: APP_DEFAULT_MODEL_ID,
      defaultSubagentModelId: APP_DEFAULT_MODEL_ID,
      modelVariants: [],
      enabledModelIds: ["openai/gpt-5"],
    });
  });

  test("leaves Vercel users unchanged", () => {
    const result = sanitizeUserPreferencesForSession(
      basePreferences,
      vercelSession,
      requestUrl,
    );

    expect(result).toEqual(basePreferences);
  });
});
