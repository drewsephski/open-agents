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
  fail?(reason: InferenceAccountingFailureReason): Promise<void>;
}

export type InferenceAccountingFailureReason =
  | "provider_error"
  | "stream_cancelled"
  | "stream_truncated";

export class InferenceAccountingSettlementError extends Error {
  constructor(cause: unknown) {
    super(
      `Inference accounting settlement failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "InferenceAccountingSettlementError";
  }
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
        let result: Awaited<ReturnType<typeof doGenerate>>;
        try {
          result = await doGenerate();
        } catch (error) {
          await accounting.fail?.("provider_error");
          throw error;
        }
        try {
          await accounting.reconcile({
            cost: extractModelCostUsd(result.providerMetadata),
            usage: result.usage,
          });
        } catch (error) {
          throw new InferenceAccountingSettlementError(error);
        }
        return result;
      },
      wrapStream: async ({ doStream }) => {
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          result = await doStream();
        } catch (error) {
          await accounting.fail?.("provider_error");
          throw error;
        }

        const reader = result.stream.getReader();
        return {
          ...result,
          stream: new ReadableStream({
            async pull(controller) {
              let next: Awaited<ReturnType<typeof reader.read>>;
              try {
                next = await reader.read();
              } catch (error) {
                await accounting.fail?.("provider_error");
                controller.error(error);
                return;
              }

              if (next.done) {
                try {
                  await accounting.fail?.("stream_truncated");
                  controller.close();
                } catch (error) {
                  controller.error(error);
                }
                return;
              }
              if (next.value.type === "finish") {
                try {
                  await accounting.reconcile({
                    cost: extractModelCostUsd(next.value.providerMetadata),
                    usage: next.value.usage,
                  });
                } catch (error) {
                  controller.error(
                    new InferenceAccountingSettlementError(error),
                  );
                  return;
                }
              }
              controller.enqueue(next.value);
            },
            async cancel(reason) {
              try {
                await reader.cancel(reason);
              } finally {
                await accounting.fail?.("stream_cancelled");
              }
            },
          }),
        };
      },
    },
  });
}
