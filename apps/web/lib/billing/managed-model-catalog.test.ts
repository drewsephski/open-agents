import { describe, expect, test } from "bun:test";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { getManagedModelIds } from "./managed-model-catalog";

describe("managed model catalog", () => {
  test("always includes GLM 5.3 Flash", () => {
    expect(getManagedModelIds({})).toContain("z-ai/glm-5.3-flash");
    expect(APP_DEFAULT_MODEL_ID).toBe("z-ai/glm-5.3-flash");
  });

  test("accepts a deduplicated server-configured curated catalog", () => {
    expect(
      getManagedModelIds({
        MANAGED_OPENROUTER_MODEL_IDS:
          "anthropic/claude-sonnet-4.5, z-ai/glm-5.3-flash, anthropic/claude-sonnet-4.5",
      }),
    ).toEqual(["z-ai/glm-5.3-flash", "anthropic/claude-sonnet-4.5"]);
  });
});
