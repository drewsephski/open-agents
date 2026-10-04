import type { ToolSet } from "ai";
import type { ActionToolkit } from "./registry";
import type { ActionExecutionScope } from "./scope";

/** Serializable references only; provider clients and tools stay in server steps. */
export interface ActionSession {
  userId: string;
  sessionId: string;
}
export interface ActionExecutionSession extends ActionSession {
  scope: ActionExecutionScope;
}
export type ActionConnectionStatus = "not_connected" | "connected";
export type ActionConnection =
  | { status: "not_connected" }
  | { status: "connected"; accountId: string };

export interface ActionProvider {
  id: "composio";
  createSession(userId: string, scope: ActionExecutionScope): Promise<string>;
  createConnectionSession(
    userId: string,
    toolkit: ActionToolkit,
  ): Promise<string>;
  getConnection(
    session: ActionSession,
    toolkit: ActionToolkit,
  ): Promise<ActionConnection>;
  connect(
    session: ActionSession,
    toolkit: ActionToolkit,
    callbackUrl: string,
  ): Promise<string>;
  getTools(session: ActionExecutionSession): Promise<ToolSet>;
}
