import type { Metadata } from "next";
import { STORE, SUPPORT_URL } from "@/lib/store-details";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Effective {STORE.policyDate}.</p>
      <section>
        <h2>Who operates Launchstack</h2>
        <p>
          {STORE.name} is operated by {STORE.operator} in the {STORE.country}.
          For privacy questions or requests, contact{" "}
          <a href={SUPPORT_URL}>{STORE.supportEmail}</a>.
        </p>
      </section>
      <section>
        <h2>Information we process</h2>
        <ul>
          <li>
            Account information such as name, email, profile image, username,
            and authentication records.
          </li>
          <li>
            Connected-account identifiers, authorization tokens, and repository
            information needed for the integrations you enable.
          </li>
          <li>
            If you connect Gmail, email messages, recipients, attachments, and
            draft or send content accessed for the tasks you request, plus
            records of approvals and action results.
          </li>
          <li>
            If you connect Linear, issue details and search results accessed for
            your requested tasks, plus records of action results.
          </li>
          <li>
            Prompts, attachments, repository files the agent reads, generated
            code, messages, command output, session history, and usage records.
          </li>
          <li>
            Operational information such as request logs, errors, device/browser
            information, and site usage analytics.
          </li>
          <li>
            Support correspondence and, when paid subscriptions open, customer,
            order, subscription, and billing-status records.
          </li>
        </ul>
        <p>
          Do not include secrets or sensitive personal information in prompts or
          repository files unless needed for your task and you are authorized to
          share them.
        </p>
      </section>
      <section>
        <h2>How we use information</h2>
        <p>
          We process information to authenticate users, run coding tasks,
          maintain session history, connect repositories, measure usage,
          troubleshoot issues, prevent abuse, respond to support requests, and
          meet legal and billing obligations. We do not sell your personal
          information.
        </p>
        <p>
          Connected Gmail data is used to carry out your requested email tasks.
          Draft creation and sending require your approval in Launchstack.
          Review the displayed recipients and message before approving.
        </p>
      </section>
      <section>
        <h2>Service providers and sharing</h2>
        <p>
          Hosting and cloud execution involve Vercel and, depending on the
          configured sandbox backend, CodeSandbox. Account and session records
          are stored in our PostgreSQL database hosted by Neon. Connected GitHub
          and Vercel accounts are used according to the permissions you grant.
        </p>
        <p>
          Optional Gmail and Linear actions use Composio to connect accounts and
          execute the actions you authorize. Connection credentials remain with
          Composio. Retrieved email and issue content may enter the conversation
          context sent to the selected model provider. Connect an account only
          if you are authorized to share the information needed for your tasks.
        </p>
        <p>
          If you connect Codex, we encrypt and store the login file you import,
          including subscription authorization tokens. Tokens are used
          temporarily in your isolated workspace and refreshed by the official
          Codex CLI. Disconnecting deletes the saved connection. Codex tasks
          send relevant prompts, code, and conversation context directly to
          OpenAI under your account.
        </p>
        <p>
          Prompts, relevant code, attachments, and conversation context may be
          sent through OpenRouter to the selected model provider to produce
          responses. These providers have their own processing and retention
          policies. Do not assume that all model providers have identical
          data-use practices.
        </p>
        <p>
          Vercel Analytics processes website usage information. When paid
          subscriptions open, Creem will handle checkout, payments, tax,
          receipts, and its customer portal as merchant of record. We do not
          receive your full payment-card details. We may also share information
          when legally required or necessary to protect users and the service.
        </p>
      </section>
      <section>
        <h2>Cookies, browser storage, and public sharing</h2>
        <p>
          Authentication uses session cookies. Browser storage keeps preferences
          such as your selected theme. You can clear browser storage or cookies,
          but this may sign you out or reset preferences. If you enable a public
          session share, anyone with its link may view the shared content;
          review it before sharing and disable the share when no longer needed.
        </p>
      </section>
      <section>
        <h2>Retention and security</h2>
        <p>
          We retain account and session information while needed to provide the
          service. We may retain some records afterward for billing, security,
          dispute resolution, or legal obligations. Copies may remain in backups
          until those backups expire. We use access controls and protections for
          authentication credentials, but no online service can guarantee
          absolute security.
        </p>
      </section>
      <section>
        <h2>Your choices and requests</h2>
        <p>
          You can manage connected accounts and public shares within
          Launchstack. Contact support to request access, correction, export, or
          deletion of your personal information or account. We may verify your
          identity before processing a request and explain any legal or
          technical limits. Rights vary by location; where applicable, you may
          also object to processing, request restriction, or complain to your
          local data-protection authority.
        </p>
      </section>
      <section>
        <h2>International processing and updates</h2>
        <p>
          Our providers may process information in the United States and other
          countries. Applicable privacy protections can differ. This policy may
          change as the service develops; the effective date above identifies
          the current version.
        </p>
      </section>
    </>
  );
}
