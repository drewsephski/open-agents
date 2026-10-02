/** The entire initial external-action surface. No generic execution/meta tools. */
export const GMAIL_ACTIONS = {
  GMAIL_FETCH_EMAILS: { label: "Fetch Gmail emails", mutating: false },
  GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: {
    label: "Read Gmail email",
    mutating: false,
  },
  GMAIL_CREATE_EMAIL_DRAFT: { label: "Create Gmail draft", mutating: true },
  GMAIL_SEND_EMAIL: { label: "Send Gmail email", mutating: true },
} as const;

export function isGmailAction(
  name: string,
): name is keyof typeof GMAIL_ACTIONS {
  return Object.hasOwn(GMAIL_ACTIONS, name);
}

export function isMutatingGmailAction(name: string): boolean {
  return isGmailAction(name) && GMAIL_ACTIONS[name].mutating;
}
