"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PromptCopyButton({ prompt }: { readonly prompt: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copyPrompt}
      className="inline-flex h-7 items-center gap-1.5 border border-(--l-border) px-2 font-mono text-[10px] uppercase tracking-wider text-(--l-fg-3) transition-colors hover:bg-(--l-fg) hover:text-(--l-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--l-fg) focus-visible:ring-offset-2 focus-visible:ring-offset-(--l-bg)"
      aria-label={copied ? "Prompt copied" : "Copy prompt"}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy prompt"}</span>
    </button>
  );
}
