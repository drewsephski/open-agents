import type { ToolSet } from "ai";

/** Serializable references only; provider clients and tools stay in server steps. */
export interface ActionSession {
  userId: string;
  sessionId: string;
}

export type ActionConnectionStatus = "not_connected" | "connected";

export interface ActionProvider {
  id: string;
  createSession(userId: string): Promise<string>;
  getConnectionStatus(session: ActionSession): Promise<ActionConnectionStatus>;
  connect(session: ActionSession, callbackUrl: string): Promise<string>;
  getTools(session: ActionSession): Promise<ToolSet>;
}
