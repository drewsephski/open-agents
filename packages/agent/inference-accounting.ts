import { type LanguageModel, wrapLanguageModel } from "ai";
import {
  extractModelCostUsd,
  type NormalizedModelCost,
} from "./usage-metadata";

export interface InferenceAccountingResult {
  cost: NormalizedModelCost | undefined;
  usage: Awaited<ReturnType<LanguageModelV3["doGenerate"]>>["usage"];
}

type LanguageModelV3 = Extract<LanguageModel, { specificationVersion: "v3" }>;

export interface InferenceAccountingCallbacks {
  reconcile(result: InferenceAccountingResult): Promise<void>;
  fail?(): Promise<void>;
}

export function withInferenceAccounting(
  languageModel: LanguageModelV3,
  accounting: InferenceAccountingCallbacks,
): LanguageModelV3 {
  return wrapLanguageModel({
    model: languageModel,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate }) => {
        try {
          const result = await doGenerate();
          await accounting.reconcile({
            cost: extractModelCostUsd(result.providerMetadata),
            usage: result.usage,
          });
          return result;
        } catch (error) {
          await accounting.fail?.();
          throw error;
        }
      },
      wrapStream: async ({ doStream }) => {
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          result = await doStream();
        } catch (error) {
          await accounting.fail?.();
          throw error;
        }

        const reader = result.stream.getReader();
        return {
          ...result,
          stream: new ReadableStream({
            async pull(controller) {
              try {
                const next = await reader.read();
                if (next.done) {
                  await accounting.fail?.();
                  controller.close();
                  return;
                }
                if (next.value.type === "finish") {
                  await accounting.reconcile({
                    cost: extractModelCostUsd(next.value.providerMetadata),
                    usage: next.value.usage,
                  });
                }
                controller.enqueue(next.value);
              } catch (error) {
                await accounting.fail?.();
                controller.error(error);
              }
            },
            async cancel(reason) {
              try {
                await reader.cancel(reason);
              } finally {
                await accounting.fail?.();
              }
            },
          }),
        };
      },
    },
  });
}
