"use client";

/**
 * Blocking inline script that runs from SSR HTML, then becomes inert on the
 * client so React 19 does not warn that component `<script>` tags never execute.
 *
 * @see https://nextjs.org/docs/app/guides/preventing-flash-before-hydration
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
