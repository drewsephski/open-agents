import { describe, expect, test, spyOn } from "bun:test";
import { selectLightBackgroundLogo, getSvglCatalog } from "./svgl";

describe("selectLightBackgroundLogo", () => {
  test("uses the light-background variant for white logo badges", () => {
    expect(
      selectLightBackgroundLogo({
        light: "https://svgl.app/library/resend-icon-black.svg",
        dark: "https://svgl.app/library/resend-icon-white.svg",
      }),
    ).toBe("https://svgl.app/library/resend-icon-black.svg");
  });

  test("preserves logos without theme variants", () => {
    expect(
      selectLightBackgroundLogo(
        "https://svgl.app/library/nextjs_icon_dark.svg",
      ),
    ).toBe("https://svgl.app/library/nextjs_icon_dark.svg");
  });
});

test("uses verified official catalog data when the upstream API rejects server egress", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("Forbidden", { status: 403 }),
  );
  try {
    const catalog = await getSvglCatalog();
    expect(catalog.length).toBeGreaterThan(100);
    expect(catalog.some((entry) => entry.name === "Next.js")).toBe(true);
    expect(
      catalog.every((entry) => entry.logo.startsWith("https://svgl.app/")),
    ).toBe(true);
  } finally {
    fetchSpy.mockRestore();
  }
});
