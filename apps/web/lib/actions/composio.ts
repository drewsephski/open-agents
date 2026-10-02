import "server-only";
import { Composio, SessionPreset } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { dynamicTool, type ToolSet } from "ai";
import { GMAIL_ACTIONS, isGmailAction } from "./gmail-policy";
import type { ActionProvider } from "./provider";

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
    async createSession(userId) {
      const session = await composio.create(
        userId,
        {
          sessionPreset: SessionPreset.DIRECT_TOOLS,
          toolkits: ["gmail"],
          tools: { gmail: { enable: Object.keys(GMAIL_ACTIONS) } },
          manageConnections: false,
          sandbox: { enable: false },
          instant: false,
          ...(process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
            ? {
                authConfigs: {
                  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
                },
              }
            : {}),
        },
        requestOptions(),
      );
      return session.sessionId;
    },
    async getConnectionStatus({ sessionId }) {
      const session = await composio.use(
        sessionId,
        undefined,
        requestOptions(),
      );
      const { items } = await session.toolkits({ toolkits: ["gmail"] });
      return items.some(
        (item) => item.slug === "gmail" && item.connection?.isActive,
      )
        ? "connected"
        : "not_connected";
    },
    async connect({ sessionId }, callbackUrl) {
      const session = await composio.use(
        sessionId,
        undefined,
        requestOptions(),
      );
      const connection = await session.authorize("gmail", { callbackUrl });
      if (!connection.redirectUrl) {
        throw new Error("Gmail authorization did not return a redirect URL");
      }
      const url = new URL(connection.redirectUrl);
      if (url.protocol !== "https:") {
        throw new Error("Invalid Gmail authorization URL");
      }
      return url.href;
    },
    async getTools({ sessionId }) {
      const schemas = await composio.tools.getRawToolRouterSessionTools(
        sessionId,
        undefined,
        requestOptions(),
      );
      const allowedSchemas = schemas.filter((schema) =>
        isGmailAction(schema.slug),
      );
      const wrapped = provider.wrapTools(allowedSchemas, async (slug, args) => {
        if (!isGmailAction(slug)) {
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
        if (isGmailAction(name)) {
          const execute = definition.execute;
          if (!execute) throw new Error("Gmail tool has no executor");
          tools[name] = dynamicTool({
            description: definition.description,
            inputSchema: definition.inputSchema,
            execute: (input, options) => execute(input, options),
            needsApproval: GMAIL_ACTIONS[name].mutating,
          });
        }
      }
      return tools;
    },
  };
}
