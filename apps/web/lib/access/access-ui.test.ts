import { describe, expect, test } from "bun:test";
import {
  getAllowancePresentation,
  isInferenceEligible,
  PRICING_PLANS,
} from "./access-ui";

describe("access UI policy", () => {
  test("treats valid BYOK or paid managed access as eligible", () => {
    expect(
      isInferenceEligible({ byokState: "valid", hasManagedAccess: false }),
    ).toBe(true);
    expect(
      isInferenceEligible({ byokState: "missing", hasManagedAccess: true }),
    ).toBe(true);
    expect(
      isInferenceEligible({ byokState: "revoked", hasManagedAccess: false }),
    ).toBe(false);
  });

  test.each([
    [74, "none", "neutral"],
    [75, "passive", "neutral"],
    [90, "prominent", "warning"],
    [100, "exhausted", "action"],
  ] as const)("maps %i percent to %s", (percent, warning, tone) => {
    expect(getAllowancePresentation(percent, "inference")).toMatchObject({
      warning,
      tone,
    });
  });

  test("publishes exact BYOK and Pro limits without unlimited claims", () => {
    expect(PRICING_PLANS).toMatchObject([
      {
        id: "byok",
        price: "$0",
        features: expect.arrayContaining([
          "Your own OpenRouter key",
          "2 sandbox hours per UTC month",
          "1 concurrent sandbox",
        ]),
      },
      {
        id: "pro",
        price: "$29",
        features: expect.arrayContaining([
          "AI usage included each month",
          "Continue with your own OpenRouter key after included usage",
          "25 sandbox hours per billing period",
          "2 concurrent sandboxes",
        ]),
      },
    ]);
    expect(JSON.stringify(PRICING_PLANS).toLowerCase()).not.toContain(
      "unlimited",
    );
    expect(JSON.stringify(PRICING_PLANS)).toContain("Codex subscription");
  });
});
