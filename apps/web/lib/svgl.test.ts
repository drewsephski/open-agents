import { describe, expect, test } from "bun:test";
import { selectRelevantSvglTechnologies, type SvglTechnology } from "./svgl";

function technology(name: string): SvglTechnology {
  return {
    id: name,
    name,
    role: "Software",
    logo: `https://svgl.app/${name}.svg`,
  };
}

function technologyWithRole(name: string, role: string): SvglTechnology {
  return { ...technology(name), role };
}

describe("selectRelevantSvglTechnologies", () => {
  test("keeps any explicitly named SVGL technology eligible", () => {
    const catalog = [technology("Next.js"), technology("ObscureDB")];
    const selected = selectRelevantSvglTechnologies(
      catalog,
      "Build a reporting service with ObscureDB",
    );

    expect(selected.map(({ name }) => name)).toContain("ObscureDB");
  });

  test("expands product intent into relevant catalog choices", () => {
    const catalog = [technology("Expo"), technology("Stripe")];
    const selected = selectRelevantSvglTechnologies(
      catalog,
      "A paid iOS app with subscriptions",
    );

    expect(selected.map(({ name }) => name)).toEqual(["Expo", "Stripe"]);
  });

  test("fills the candidate set across different technology categories", () => {
    const catalog = [
      technologyWithRole("Framework One", "Framework"),
      technologyWithRole("Framework Two", "Framework"),
      technologyWithRole("Database One", "Database"),
      technologyWithRole("Language One", "Language"),
      technologyWithRole("Hosting One", "Hosting"),
    ];

    const selected = selectRelevantSvglTechnologies(
      catalog,
      "Build a useful product",
      4,
    );

    expect(selected.map(({ role }) => role)).toEqual([
      "Framework",
      "Database",
      "Language",
      "Hosting",
    ]);
  });
});
