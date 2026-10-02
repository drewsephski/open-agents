/** Public commercial details. Keep Creem Store settings and product copy aligned. */
export const STORE = {
  name: "Launchstack",
  operator: "Andrew Sepeczi",
  country: "United States",
  website: "https://launchstack.sh",
  supportEmail: "drewsepeczi@gmail.com",
  policyDate: "October 2, 2026",
  pro: {
    monthlyPriceUsd: 29,
    inferenceUsd: 10,
    sandboxHours: 25,
    concurrentSandboxes: 2,
  },
  refundDays: 7,
} as const;

export const SUPPORT_URL = `mailto:${STORE.supportEmail}`;

export const POLICY_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/refunds", label: "Refund Policy" },
  { href: "/support", label: "Support" },
] as const;
