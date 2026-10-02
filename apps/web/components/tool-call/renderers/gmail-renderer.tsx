"use client";

import { Mail } from "lucide-react";
import type { WebAgentUIToolPart } from "@/app/types";
import type { ToolRenderState } from "@/app/lib/render-tool";
import { GMAIL_ACTIONS } from "@/lib/actions/gmail-policy";
import { ToolLayout } from "../tool-layout";

type GmailActionName = keyof typeof GMAIL_ACTIONS;

export function GmailRenderer({
  part,
  state,
  name,
  onApprove,
  onDeny,
}: {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  name: GmailActionName;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}) {
  const action = GMAIL_ACTIONS[name];
  const input: unknown = part.input;
  const output: unknown =
    part.state === "output-available" ? part.output : undefined;
  const failed =
    typeof output === "object" &&
    output !== null &&
    "successful" in output &&
    output.successful === false;
  const mergedState = failed
    ? { ...state, error: "Gmail action failed" }
    : state;
  return (
    <ToolLayout
      name={action.label}
      icon={<Mail className="size-3.5" />}
      summary={
        action.mutating ? "Review email details" : "Connected Gmail account"
      }
      state={mergedState}
      onApprove={onApprove}
      onDeny={onDeny}
      expandedContent={
        output === undefined ? undefined : (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(output, null, 2)}
          </pre>
        )
      }
    >
      {action.mutating && input !== undefined && (
        <div className="mt-2 rounded-md border border-border/50 p-3">
          <p className="mb-2 text-xs font-medium">
            {name === "GMAIL_SEND_EMAIL"
              ? "Approve to send this email"
              : "Approve to save this draft to Gmail"}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}
    </ToolLayout>
  );
}
