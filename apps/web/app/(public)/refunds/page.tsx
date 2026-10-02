import type { Metadata } from "next";
import { STORE, SUPPORT_URL } from "@/lib/store-details";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p>Effective {STORE.policyDate}.</p>
      <section>
        <h2>Seven-day refund window</h2>
        <p>
          You may request a full refund within {STORE.refundDays} days of an
          initial Pro subscription payment or any renewal. Email{" "}
          <a href={SUPPORT_URL}>{STORE.supportEmail}</a> with your account email
          and order identifier. No usage threshold applies to requests made
          within this window.
        </p>
      </section>
      <section>
        <h2>Processing and access</h2>
        <p>
          We aim to respond within three business days. Approved refunds are
          processed through Creem to the original payment method; your bank or
          payment provider determines when funds appear. A full refund ends paid
          access for the refunded period. We do not provide routine prorated
          refunds after the seven-day window, but will review billing errors and
          service problems individually.
        </p>
      </section>
      <section>
        <h2>Cancellation and your rights</h2>
        <p>
          Cancel future renewals through the Creem Customer Portal linked from
          your receipt, or contact support for help. Cancellation alone does not
          request a refund. This policy does not limit mandatory consumer rights
          under applicable law. OpenRouter charges for your own API key are
          separate and governed by that provider&apos;s refund policy.
        </p>
      </section>
    </>
  );
}
