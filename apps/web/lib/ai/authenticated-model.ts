import "server-only";
import { model, type ProviderOptionsByProvider } from "@open-agents/agent";
import type { LanguageModel } from "ai";
import { requireModelCredential } from "@/lib/access/model-credential-resolver";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";

export async function getAuthenticatedLanguageModel(params: {
  userId: string;
  modelId?: string;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}): Promise<LanguageModel> {
  const modelId = params.modelId ?? APP_DEFAULT_MODEL_ID;
  const credential = await requireModelCredential({
    userId: params.userId,
    modelId,
  });

  return model(modelId, {
    config: credential.openRouter,
    providerOptionsOverrides: params.providerOptionsOverrides,
  });
}
