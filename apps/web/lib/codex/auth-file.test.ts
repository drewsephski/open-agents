import { describe, expect, test } from "bun:test";
import { parseCodexAuthFile } from "./auth-file";
const tokens = {
  id_token: "identity-secret",
  access_token: "access-secret",
  refresh_token: "refresh-secret",
  account_id: "account",
};

describe("Codex subscription login file", () => {
  test("accepts subscription auth and projects only supported fields", () => {
    expect(
      JSON.parse(
        parseCodexAuthFile(
          JSON.stringify({
            tokens,
            unrelated: "discard",
            OPENAI_API_KEY: null,
          }),
        ),
      ),
    ).toEqual({ tokens, OPENAI_API_KEY: null });
  });
  test("rejects API-key auth, incomplete tokens, wrong auth mode and oversized files", () => {
    for (const value of [
      { OPENAI_API_KEY: "sk-secret" },
      { tokens, OPENAI_API_KEY: "sk-secret" },
      { tokens, auth_mode: "apikey" },
      { tokens: { access_token: "secret" } },
    ]) {
      expect(() => parseCodexAuthFile(JSON.stringify(value))).toThrow(
        "Invalid Codex login file",
      );
    }
    expect(() => parseCodexAuthFile("a".repeat(65537))).toThrow();
  });
  test("never echoes provider secrets in parse errors", () => {
    try {
      parseCodexAuthFile('{"SECRET_ACCESS_TOKEN"');
    } catch (error) {
      expect(String(error)).not.toContain("SECRET_ACCESS_TOKEN");
    }
  });
});
