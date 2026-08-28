import { describe, expect, test } from "bun:test";
import { selectLightBackgroundLogo } from "./svgl";

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
