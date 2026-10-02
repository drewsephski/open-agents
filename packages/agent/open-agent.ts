import type { SandboxState } from "@open-agents/sandbox";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import { addCacheControl } from "./context-management";
import {
  type ModelId,
  type OpenRouterConfig,
  constructorPlaceholderModel,
  model,
  resolveDefaultModelId,
  type ProviderOptionsByProvider,
} from "./models";

import type { SkillMetadata } from "./skills/types";
import { buildSystemPrompt } from "./system-prompt";
import {
  askUserQuestionTool,
  bashTool,
  editFileTool,
  globTool,
  grepTool,
  readFileTool,
  skillTool,
  taskTool,
  todoWriteTool,
  webFetchTool,
  writeFileTool,
} from "./tools";

export interface AgentModelSelection {
  id: ModelId;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type OpenAgentModelInput = ModelId | AgentModelSelection;
export type ResolveSubagentOpenRouterConfig = (params: {
  modelId: ModelId;
}) => Promise<OpenRouterConfig>;

export interface AgentSandboxContext {
  state: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
}

const openRouterConfigSchema: z.ZodType<OpenRouterConfig> = z.object({
  apiKey: z.string().trim().min(1),
  baseURL: z.string().optional(),
  accounting: z
    .custom<OpenRouterConfig["accounting"]>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "reconcile" in value &&
        typeof value.reconcile === "function",
    )
    .optional(),
});

const callOptionsSchema = z.object({
  sandbox: z.custom<AgentSandboxContext>(),
  openRouter: openRouterConfigSchema,
  resolveSubagentOpenRouter: z.custom<ResolveSubagentOpenRouterConfig>(
    (value) => typeof value === "function",
    "A subagent OpenRouter authorization resolver is required.",
  ),
  model: z.custom<OpenAgentModelInput>().optional(),
  subagentModel: z.custom<OpenAgentModelInput>().optional(),
  customInstructions: z.string().optional(),
  missionInstructions: z.string().optional(),
  skills: z.custom<SkillMetadata[]>().optional(),
});

export type OpenAgentCallOptions = z.infer<typeof callOptionsSchema>;

export const defaultModelLabel = resolveDefaultModelId();
export const defaultModel = constructorPlaceholderModel(defaultModelLabel);

function normalizeAgentModelSelection(
  selection: OpenAgentModelInput | undefined,
  fallbackId: ModelId,
): AgentModelSelection {
  if (!selection) {
    return { id: fallbackId };
  }

  return typeof selection === "string" ? { id: selection } : selection;
}

const tools = {
  todo_write: todoWriteTool,
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  task: taskTool,
  ask_user_question: askUserQuestionTool,
  skill: skillTool,
  web_fetch: webFetchTool,
} satisfies ToolSet;

/** Construct per-call tools in the control plane; never serialize this agent. */
export function createOpenAgent<T extends ToolSet>(additionalTools: T) {
  for (const name of Object.keys(additionalTools)) {
    if (Object.hasOwn(tools, name)) {
      throw new Error(`Action tool collides with coding tool: ${name}`);
    }
  }
  const agentTools = { ...tools, ...additionalTools };
  return new ToolLoopAgent({
    model: defaultModel,
    instructions: buildSystemPrompt({}),
    tools: agentTools,
    stopWhen: stepCountIs(1),
    callOptionsSchema,
    prepareStep: ({ messages, model, steps: _steps }) => {
      return {
        messages: addCacheControl({
          messages,
          model,
        }),
      };
    },
    prepareCall: ({ options, ...settings }) => {
      if (!options) {
        throw new Error("The agent requires call options with sandbox.");
      }

      const fallbackModelId = resolveDefaultModelId();
      const mainSelection = normalizeAgentModelSelection(
        options.model,
        fallbackModelId,
      );
      const subagentSelection = options.subagentModel
        ? normalizeAgentModelSelection(options.subagentModel, fallbackModelId)
        : mainSelection;

      const callModel = model(mainSelection.id, {
        config: options.openRouter,
        providerOptionsOverrides: mainSelection.providerOptionsOverrides,
      });
      const subagentModelRuntime = {
        modelId: subagentSelection.id,
        resolveModel: async () =>
          model(subagentSelection.id, {
            config: await options.resolveSubagentOpenRouter({
              modelId: subagentSelection.id,
            }),
            providerOptionsOverrides:
              subagentSelection.providerOptionsOverrides,
          }),
      };
      const customInstructions = options.customInstructions;
      const sandbox = options.sandbox;
      const skills = options.skills ?? [];
      const missionInstructions = options.missionInstructions;

      const instructions = buildSystemPrompt({
        cwd: sandbox.workingDirectory,
        currentBranch: sandbox.currentBranch,
        customInstructions,
        missionInstructions,
        environmentDetails: sandbox.environmentDetails,
        skills,
        modelId: mainSelection.id,
      });

      return {
        ...settings,
        model: callModel,
        tools: addCacheControl({
          tools: settings.tools ?? agentTools,
          model: callModel,
        }),
        instructions,
        experimental_context: {
          sandbox,
          skills,
          model: callModel,
          subagentModelRuntime,
        },
      };
    },
  });
}

export const openAgent = createOpenAgent({});

export type OpenAgent = typeof openAgent;
