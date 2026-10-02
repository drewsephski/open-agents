import { describe, expect, test } from "bun:test";
import type { UserPreferencesData } from "@/lib/db/user-preferences";
import type { ModelVariant } from "@/lib/model-variants";
import {
  filterModelsForSession,
  filterModelVariantsForSession,
  isRestrictedModelIdForSession,
  sanitizeSelectedModelIdForSession,
  sanitizeUserPreferencesForSession,
} from "./model-access";

const session = {
  authProvider: "vercel" as const,
  user: {
    id: "user-1",
    username: "alice",
    email: "alice@example.com",
    avatar: "",
  },
};
const requestUrl = "https://open-agents.dev/api/test";
const variant: ModelVariant = {
  id: "variant:user-opus",
  name: "User Opus",
  baseModelId: "anthropic/claude-opus-4.6",
  providerOptions: { effort: "high" },
};
const preferences: UserPreferencesData = {
  defaultModelId: "anthropic/claude-opus-4.6",
  defaultSubagentModelId: variant.id,
  defaultSandboxType: "vercel",
  defaultDiffMode: "unified",
  autoCommitPush: false,
  autoCreatePr: false,
  alertsEnabled: true,
  alertSoundEnabled: true,
  publicUsageEnabled: false,
  globalSkillRefs: [],
  modelVariants: [variant],
  enabledModelIds: [variant.baseModelId],
};

describe("model access", () => {
  test("does not infer authenticated model privileges from deployment host or email domain", () => {
    expect(
      isRestrictedModelIdForSession(variant.baseModelId, session, requestUrl),
    ).toBe(false);
    expect(
      filterModelsForSession(
        [{ id: variant.baseModelId }],
        session,
        requestUrl,
      ),
    ).toEqual([{ id: variant.baseModelId }]);
    expect(
      filterModelVariantsForSession([variant], session, requestUrl),
    ).toEqual([variant]);
  });

  test("preserves User model selections for central inference policy evaluation", () => {
    expect(
      sanitizeSelectedModelIdForSession(
        variant.id,
        [variant],
        session,
        requestUrl,
      ),
    ).toBe(variant.id);
    expect(
      sanitizeUserPreferencesForSession(preferences, session, requestUrl),
    ).toEqual(preferences);
  });
});
