import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DynamicToolUIPart } from "ai";
import { GmailRenderer } from "./gmail-renderer";

test("send approval exposes the complete recipient, subject, body and cc/bcc", () => {
  const part: DynamicToolUIPart = {
    type: "dynamic-tool",
    toolName: "GMAIL_SEND_EMAIL",
    toolCallId: "send-1",
    state: "approval-requested",
    approval: { id: "approval-1" },
    input: {
      recipient_email: "reader@example.com",
      subject: "Reply",
      body: "The complete response body must stay visible.",
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
    },
  };
  const html = renderToStaticMarkup(
    <GmailRenderer
      part={part}
      name="GMAIL_SEND_EMAIL"
      state={{
        running: false,
        denied: false,
        interrupted: false,
        approvalRequested: true,
        isActiveApproval: false,
        approvalId: "approval-1",
      }}
    />,
  );
  for (const value of [
    "reader@example.com",
    "Reply",
    "The complete response body must stay visible.",
    "cc@example.com",
    "bcc@example.com",
    "Approve",
    "Deny",
  ]) {
    expect(html).toContain(value);
  }
});
