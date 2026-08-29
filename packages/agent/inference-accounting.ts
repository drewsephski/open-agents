import { type LanguageModel, wrapLanguageModel } from "ai";
import {
  extractModelCostUsd,
  type NormalizedModelCost,
} from "./usage-metadata";

export interface InferenceAccountingResult {
  cost: NormalizedModelCost | undefined;
  usage: Awaited<ReturnType<LanguageModelV3["doGenerate"]>>["usage"];
}

export interface InferenceAccountingSettlementContext {
  callId: string;
  userId: string;
  modelId: string;
  source: "byok" | "managed";
  agentType: "main" | "subagent";
  occurredAt: string;
}

export interface InferenceAccountingSettlement {
  context: InferenceAccountingSettlementContext;
  result: InferenceAccountingResult;
}

type LanguageModelV3 = Extract<LanguageModel, { specificationVersion: "v3" }>;

export interface InferenceAccountingCallbacks {
  settlementContext?: InferenceAccountingSettlementContext;
  reconcile(result: InferenceAccountingResult): Promise<void>;
  fail?(reason: InferenceAccountingFailureReason): Promise<void>;
}

export type InferenceAccountingFailureReason =
  | "provider_error"
  | "stream_cancelled"
  | "stream_truncated";

export class InferenceAccountingSettlementError extends Error {
  readonly settlement: InferenceAccountingSettlement | undefined;

  constructor(cause: unknown, settlement?: InferenceAccountingSettlement) {
    super(
      `Inference accounting settlement failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "InferenceAccountingSettlementError";
    this.settlement = settlement;
  }
}

function settlementFor(
  accounting: InferenceAccountingCallbacks,
  result: InferenceAccountingResult,
): InferenceAccountingSettlement | undefined {
  return accounting.settlementContext
    ? { context: accounting.settlementContext, result }
    : undefined;
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
        const accountingResult = {
          cost: extractModelCostUsd(result.providerMetadata),
          usage: result.usage,
        };
        try {
          await accounting.reconcile(accountingResult);
        } catch (error) {
          throw new InferenceAccountingSettlementError(
            error,
            settlementFor(accounting, accountingResult),
          );
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
                const accountingResult = {
                  cost: extractModelCostUsd(next.value.providerMetadata),
                  usage: next.value.usage,
                };
                try {
                  await accounting.reconcile(accountingResult);
                } catch (error) {
                  controller.error(
                    new InferenceAccountingSettlementError(
                      error,
                      settlementFor(accounting, accountingResult),
                    ),
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
