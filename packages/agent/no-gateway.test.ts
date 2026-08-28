import { describe, expect, test } from "bun:test";
import path from "node:path";

const FORBIDDEN = [
  "createGateway",
  "GatewayModelId",
  "getAvailableModels",
  "providerMetadata.gateway",
  "gateway.getAvailableModels",
];

const MODEL_LAYER_FILES = [
  "models.ts",
  "model-id.ts",
  "provider-options.ts",
  "usage-metadata.ts",
  "model-catalog.ts",
];

describe("OpenRouter model layer has no Vercel Gateway assumptions", () => {
  test("model layer source does not reference Vercel AI Gateway", async () => {
    for (const fileName of MODEL_LAYER_FILES) {
      const source = await Bun.file(
        path.join(import.meta.dir, fileName),
      ).text();
      for (const token of FORBIDDEN) {
        expect(source.includes(token), `${fileName} contains ${token}`).toBe(
          false,
        );
      }
      expect(source).not.toContain('import { gateway } from "ai"');
    }
  });
});
