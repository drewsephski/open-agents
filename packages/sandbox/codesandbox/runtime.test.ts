import { describe, expect, test } from "bun:test";
import { parseRuntimeRequirements } from "./runtime";

describe("CodeSandbox runtime requirements", () => {
  test("reads exact Node and pnpm pins from package.json", () => {
    expect(
      parseRuntimeRequirements(
        JSON.stringify({
          engines: { node: "24.x" },
          packageManager: "pnpm@11.5.1+sha512.93f7b57422ea7068257235b4c16eb607",
        }),
      ),
    ).toEqual({ nodeMajor: 24, pnpmPackage: "pnpm@11.5.1" });
  });

  test("accepts exact semantic Node versions", () => {
    expect(
      parseRuntimeRequirements(
        JSON.stringify({ engines: { node: "22.14.0" } }),
      ),
    ).toEqual({ nodeMajor: 22 });
  });

  test("ignores ambiguous ranges and malformed package-manager pins", () => {
    expect(
      parseRuntimeRequirements(
        JSON.stringify({
          engines: { node: ">=20 <25" },
          packageManager: "pnpm@latest; echo unsafe",
        }),
      ),
    ).toEqual({});
  });

  test("returns no requirements for invalid JSON", () => {
    expect(parseRuntimeRequirements("not json")).toEqual({});
  });
});
