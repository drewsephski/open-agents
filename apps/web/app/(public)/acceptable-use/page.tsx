import type { Metadata } from "next";
import { STORE, SUPPORT_URL } from "@/lib/store-details";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage() {
  return (
    <>
      <h1>Acceptable Use Policy</h1>
      <p>
        Effective {STORE.policyDate}. These rules apply to prompts,
        repositories, generated code, agent tools, cloud sandboxes, and
        connected services.
      </p>
      <section>
        <h2>Permitted purpose</h2>
        <p>
          Use Launchstack for lawful software development on systems and
          repositories you are authorized to access. Security testing must be
          authorized by the owner and remain within the agreed scope.
        </p>
      </section>
      <section>
        <h2>Prohibited uses</h2>
        <ul>
          <li>
            Illegal activity, fraud, scams, phishing, deceptive impersonation,
            or theft of credentials or payment information.
          </li>
          <li>
            Malware, ransomware, spyware, covert surveillance, botnets,
            destructive code, or tools intended to compromise systems.
          </li>
          <li>
            Unauthorized access, exploitation, scanning, data extraction, or
            denial-of-service attacks against third-party systems.
          </li>
          <li>
            Spam, abusive automation, fake engagement, harassment, threats,
            hateful abuse, or exploitation of children.
          </li>
          <li>
            Sexual exploitation content, nonconsensual intimate content, or
            deceptive deepfakes.
          </li>
          <li>
            Infringement of copyright, trademarks, privacy, or other rights;
            distribution of content or software without required permission or
            licenses.
          </li>
          <li>
            Bypassing access controls, usage limits, billing, safeguards, or the
            terms of connected services or model providers.
          </li>
          <li>
            Cryptocurrency mining, running unrelated persistent hosting,
            reselling sandbox access, or deliberately consuming resources to
            disrupt the service.
          </li>
          <li>
            Using the service to build or operate prohibited or unlawful
            businesses, including illegal gambling, unlawful financial services,
            or tools for automated trade execution offered through this service.
          </li>
        </ul>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <p>
          Keep credentials secure, limit agent permissions, review generated
          code, and protect personal and confidential information. Do not use
          agent output as a substitute for qualified decisions in regulated or
          high-stakes contexts. You remain responsible for deployed software and
          actions you authorize.
        </p>
      </section>
      <section>
        <h2>Reports and enforcement</h2>
        <p>
          Report suspected abuse to{" "}
          <a href={SUPPORT_URL}>{STORE.supportEmail}</a>. Include a description
          and relevant identifiers without exposing secrets. We may investigate
          reports, stop runs, restrict integrations, or suspend accounts to
          address violations or security risks. We may cooperate with lawful
          requests and notify affected users where appropriate and permitted.
          Contact support to request review of an enforcement decision.
        </p>
      </section>
    </>
  );
}
