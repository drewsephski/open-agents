import { afterEach, describe, expect, test } from "bun:test";
import { getOpenAgentsResourceProfile } from "./resource-profile";

const originalResourceProfile = process.env.OPEN_AGENTS_RESOURCE_PROFILE;

afterEach(() => {
  if (originalResourceProfile === undefined) {
    delete process.env.OPEN_AGENTS_RESOURCE_PROFILE;
  } else {
    process.env.OPEN_AGENTS_RESOURCE_PROFILE = originalResourceProfile;
  }
});

describe("getOpenAgentsResourceProfile", () => {
  test("defaults to the deployment-safe hobby profile", () => {
    delete process.env.OPEN_AGENTS_RESOURCE_PROFILE;

    expect(getOpenAgentsResourceProfile()).toBe("hobby");
  });

  test("uses the standard profile when explicitly configured", () => {
    process.env.OPEN_AGENTS_RESOURCE_PROFILE = "standard";

    expect(getOpenAgentsResourceProfile()).toBe("standard");
  });
});
