import type { Metadata } from "next";
import Link from "next/link";
import { STORE, SUPPORT_URL } from "@/lib/store-details";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Effective {STORE.policyDate}.</p>
      <section>
        <h2>Operator and service</h2>
        <p>
          {STORE.name} at {STORE.website} is operated by {STORE.operator} in the{" "}
          {STORE.country}. Contact{" "}
          <a href={SUPPORT_URL}>{STORE.supportEmail}</a>. Launchstack is an AI
          coding-agent service that can inspect repositories, generate and edit
          code, run commands and tests in cloud sandboxes, and prepare changes
          for review.
        </p>
        <p>
          By using Launchstack, you agree to these terms and the{" "}
          <Link href="/acceptable-use">Acceptable Use Policy</Link>. You must
          have legal capacity to enter this agreement and authority to connect
          the accounts, repositories, and services you use.
        </p>
      </section>
      <section>
        <h2>Your account and permissions</h2>
        <p>
          Keep your account and connected credentials secure. You are
          responsible for activities you authorize, the content you submit, and
          any permissions granted to the agent. Connect only resources you own
          or are authorized to access. Review changes and commands before
          deploying, publishing, or using generated work in production.
        </p>
      </section>
      <section>
        <h2>AI output and your content</h2>
        <p>
          AI output can contain errors, security vulnerabilities, or third-party
          material. Tests and agent summaries do not guarantee correctness,
          safety, suitability, or intellectual-property clearance. You are
          responsible for reviewing and validating output and complying with
          applicable licenses.
        </p>
        <p>
          You retain your rights in content you submit. You authorize us and our
          service providers to process that content as needed to provide,
          secure, and support Launchstack. These terms do not promise exclusive
          rights in AI output or transfer third-party intellectual-property
          rights.
        </p>
      </section>
      <section>
        <h2>Subscriptions and billing</h2>
        <p>
          Pro costs ${STORE.pro.monthlyPriceUsd} USD per month, with a monthly
          AI usage allowance, {STORE.pro.sandboxHours} running sandbox hours,
          and up to {STORE.pro.concurrentSandboxes} concurrent running sandboxes
          per paid billing period. The <Link href="/pricing">Pricing page</Link>{" "}
          explains limits, resets, and availability. There is no free trial,
          allowance rollover, or metered overage.
        </p>
        <p>
          Subscriptions are sold through Creem as merchant of record and renew
          monthly until canceled. Taxes and the total are shown before payment.
          Cancel future renewals through the Creem Customer Portal linked from
          your receipt or ask support for help. Scheduled cancellation preserves
          the paid period. A full refund or dispute may end paid access. Charges
          for your own OpenRouter key are separate.
        </p>
        <p>
          Our <Link href="/refunds">Refund Policy</Link> allows full-refund
          requests within {STORE.refundDays} days of an initial payment or
          renewal and preserves mandatory consumer rights.
        </p>
      </section>
      <section>
        <h2>Acceptable use and enforcement</h2>
        <p>
          Follow the <Link href="/acceptable-use">Acceptable Use Policy</Link>.
          We may pause or suspend accounts, runs, or connected access to address
          abuse, security risks, nonpayment, or legal obligations. We may
          investigate reports and provide notice where appropriate and lawful.
          Contact support if you believe an action was mistaken.
        </p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>
          Launchstack depends on third-party model, hosting, repository, and
          payment services. Availability and model behavior may change. We do
          not guarantee uninterrupted service or any particular coding result.
          Keep independent backups. To the extent permitted by law, the service
          is provided as available, and we are not responsible for losses caused
          by unreviewed AI output or unauthorized use of connected resources.
          Nothing in these terms excludes responsibilities or remedies that
          cannot lawfully be excluded.
        </p>
      </section>
      <section>
        <h2>Privacy and changes</h2>
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> describes data
          processing. We may update these terms as the service changes and will
          identify the effective date. Material changes to paid subscription
          pricing or allowances will be communicated before they apply to a
          future renewal. Contact support with questions or to request account
          closure.
        </p>
      </section>
    </>
  );
}
