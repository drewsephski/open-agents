import type { ToolSet } from "ai";
import type { ActionToolkit } from "./registry";
import type { ActionExecutionScope } from "./scope";
import type { ActionAccount } from "./bindings";

/** Serializable references only; provider clients and tools stay in server steps. */
export interface ActionSession {
  userId: string;
  sessionId: string;
}
export interface ActionExecutionSession extends ActionSession {
  scope: ActionExecutionScope;
}
export interface ActionProvider {
  id: "composio";
  listAccounts(
    userId: string,
    toolkit: ActionToolkit,
  ): Promise<ActionAccount[]>;
  deleteSession(sessionId: string): Promise<void>;
  createSession(userId: string, scope: ActionExecutionScope): Promise<string>;
  createConnectionSession(
    userId: string,
    toolkit: ActionToolkit,
  ): Promise<string>;
  connect(
    session: ActionSession,
    toolkit: ActionToolkit,
    callbackUrl: string,
  ): Promise<string>;
  getTools(session: ActionExecutionSession): Promise<ToolSet>;
}
