import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { InlineScript } from "./inline-script";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitializationScript = `
(() => {
  try {
    const storageKey = "open-agents-theme";
    const darkModeMediaQuery = "(prefers-color-scheme: dark)";
    const storedTheme = window.localStorage.getItem(storageKey);

    const theme =
      storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
        ? storedTheme
        : "system";

    const resolvedTheme =
      theme === "system"
        ? window.matchMedia(darkModeMediaQuery).matches
          ? "dark"
          : "light"
        : theme;

    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  } catch {
    // localStorage can throw in private browsing
  }
})();
`;

const isPreviewDeployment = process.env.VERCEL_ENV === "preview";
const faviconPath = isPreviewDeployment
  ? "/favicon-preview.svg"
  : "/favicon.ico";
const metadataBase =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : process.env.VERCEL_URL
      ? new URL(`https://${process.env.VERCEL_URL}`)
      : new URL("https://launchstack.sh");

export const metadata: Metadata = {
  metadataBase,
  applicationName: "Launchstack",
  title: {
    default: "Launchstack",
    template: "%s | Launchstack",
  },
  description:
    "Cloud coding agents that work autonomously from code to launch.",
  icons: {
    icon: faviconPath,
    shortcut: faviconPath,
  },
  openGraph: {
    title: "Launchstack",
    description:
      "Cloud coding agents that work autonomously from code to launch.",
    url: "https://launchstack.sh",
    siteName: "Launchstack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Launchstack",
    description:
      "Cloud coding agents that work autonomously from code to launch.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <InlineScript html={themeInitializationScript} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans overflow-x-hidden antialiased`}
      >
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
