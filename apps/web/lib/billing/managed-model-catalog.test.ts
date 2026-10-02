import { describe, expect, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { getManagedModelIds } from "./managed-model-catalog";

describe("managed model catalog", () => {
  test("always includes the application default", () => {
    expect(getManagedModelIds({})).toContain(APP_DEFAULT_MODEL_ID);
    expect(APP_DEFAULT_MODEL_ID).toBe("openai/gpt-6.1-sol");
  });

  test("accepts a deduplicated server-configured curated catalog", () => {
    expect(
      getManagedModelIds({
        MANAGED_OPENROUTER_MODEL_IDS:
          "anthropic/claude-sonnet-4.5, z-ai/glm-5.3-flash, anthropic/claude-sonnet-4.5",
      }),
    ).toEqual([
      APP_DEFAULT_MODEL_ID,
      "anthropic/claude-sonnet-4.5",
      "z-ai/glm-5.3-flash",
    ]);
  });
});
