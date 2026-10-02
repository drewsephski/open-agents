import type { Metadata } from "next";
import Link from "next/link";
import { STORE, SUPPORT_URL } from "@/lib/store-details";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <>
      <h1>Contact Launchstack support</h1>
      <p>
        For product questions, billing, cancellations, refunds, privacy
        requests, or reports of misuse, email{" "}
        <a href={SUPPORT_URL}>{STORE.supportEmail}</a>.
      </p>
      <p>
        Support is provided by {STORE.operator}, who operates {STORE.name} in
        the {STORE.country}. We aim to respond within three business days.
      </p>
      <p>
        Include your account email and a brief description. For billing
        requests, include the order or receipt identifier. Do not send
        passwords, API keys, payment-card details, or private repository
        content.
      </p>
      <p>
        Read our <Link href="/pricing">pricing</Link>,{" "}
        <Link href="/refunds">refund policy</Link>, and{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </>
  );
}
