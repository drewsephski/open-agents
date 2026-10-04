import "server-only";
import { Composio, SessionPreset } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { dynamicTool, type ToolSet } from "ai";
import {
  ACTION_REGISTRY,
  actionToolkitSchema,
  isAction,
  requiresActionApproval,
} from "./registry";
import { normalizeActionScope } from "./scope";
import type { ActionProvider } from "./provider";

function authConfigs(toolkits: Array<"gmail" | "linear">) {
  return Object.fromEntries(
    toolkits.flatMap((toolkit) => {
      const id =
        process.env[`COMPOSIO_${toolkit.toUpperCase()}_AUTH_CONFIG_ID`];
      return id ? [[toolkit, id]] : [];
    }),
  );
}

export function createComposioActionProvider(apiKey: string): ActionProvider {
  const provider = new VercelProvider();
  const composio = new Composio({
    apiKey,
    provider,
    allowTracking: false,
    disableVersionCheck: true,
    dangerouslyAllowAutoUploadDownloadFiles: false,
    logLevel: "silent",
  });
  // Session execution otherwise inherits transport retries, including sends.
  const client = composio.getClient().withOptions({ maxRetries: 0 });
  const requestOptions = () => ({ signal: AbortSignal.timeout(30_000) });

  return {
    id: "composio",
    async createSession(userId, value) {
      const scope = normalizeActionScope(value);
      const toolkits = [
        ...new Set(scope.tools.map((name) => ACTION_REGISTRY[name].toolkit)),
      ];
      const session = await composio.create(
        userId,
        {
          sessionPreset: SessionPreset.DIRECT_TOOLS,
          toolkits: { enable: toolkits },
          tools: Object.fromEntries(
            toolkits.map((toolkit) => [
              toolkit,
              {
                enable: scope.tools.filter(
                  (name) => ACTION_REGISTRY[name].toolkit === toolkit,
                ),
              },
            ]),
          ),
          preload: { tools: scope.tools },
          connectedAccounts: scope.connectedAccounts,
          authConfigs: authConfigs(toolkits),
          manageConnections: false,
          sandbox: { enable: false },
          instant: false,
        },
        requestOptions(),
      );
      return session.sessionId;
    },
    async createConnectionSession(userId, toolkit) {
      actionToolkitSchema.parse(toolkit);
      // UI authorization context only. Never load or execute tools from it.
      const session = await composio.create(
        userId,
        {
          sessionPreset: SessionPreset.DIRECT_TOOLS,
          toolkits: { enable: [toolkit] },
          tools: { [toolkit]: { enable: [] } },
          preload: { tools: [] },
          authConfigs: authConfigs([toolkit]),
          manageConnections: false,
          sandbox: { enable: false },
          instant: false,
        },
        requestOptions(),
      );
      return session.sessionId;
    },
    async getConnection({ sessionId }, toolkit) {
      actionToolkitSchema.parse(toolkit);
      const session = await composio.use(
        sessionId,
        undefined,
        requestOptions(),
      );
      const { items } = await session.toolkits({ toolkits: [toolkit] });
      const connection = items.find(
        (item) => item.slug === toolkit,
      )?.connection;
      return connection?.isActive && connection.connectedAccount
        ? { status: "connected", accountId: connection.connectedAccount.id }
        : { status: "not_connected" };
    },
    async connect({ sessionId }, toolkit, callbackUrl) {
      actionToolkitSchema.parse(toolkit);
      const session = await composio.use(
        sessionId,
        undefined,
        requestOptions(),
      );
      const connection = await session.authorize(toolkit, { callbackUrl });
      if (!connection.redirectUrl)
        throw new Error("Authorization did not return a redirect URL");
      const url = new URL(connection.redirectUrl);
      if (url.protocol !== "https:")
        throw new Error("Invalid authorization URL");
      return url.href;
    },
    async getTools({ sessionId, scope: value }) {
      const scope = normalizeActionScope(value);
      const allowed = (name: string) =>
        isAction(name) && scope.tools.includes(name);
      const schemas = await composio.tools.getRawToolRouterSessionTools(
        sessionId,
        undefined,
        requestOptions(),
      );
      const allowedSchemas = schemas.filter((schema) => allowed(schema.slug));
      const wrapped = provider.wrapTools(allowedSchemas, async (slug, args) => {
        if (!allowed(slug)) {
          throw new Error("Action is not allowed");
        }
        const result = await client.toolRouter.session.execute(
          sessionId,
          { tool_slug: slug, arguments: args },
          requestOptions(),
        );
        return {
          data: result.data,
          error: result.error ?? null,
          successful: !result.error,
        };
      });
      const tools: ToolSet = {};
      for (const [name, definition] of Object.entries(wrapped)) {
        if (allowed(name)) {
          const execute = definition.execute;
          if (!execute) throw new Error("Action tool has no executor");
          tools[name] = dynamicTool({
            description: definition.description,
            inputSchema: definition.inputSchema,
            execute: (input, options) => execute(input, options),
            needsApproval: requiresActionApproval(name),
          });
        }
      }
      if (scope.tools.some((name) => !tools[name]))
        throw new Error(
          "Required action schemas are unavailable for this execution scope",
        );
      return tools;
    },
  };
}
