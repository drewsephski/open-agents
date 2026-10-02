"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/swr";

export function GmailSection() {
  const { data, error, isLoading, mutate } = useSWR<{
    enabled: boolean;
    status: "connected" | "not_connected";
  }>("/api/connections/gmail", fetcher);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>();

  async function connect() {
    setConnecting(true);
    setConnectError(undefined);
    try {
      const response = await fetch("/api/connections/gmail", {
        method: "POST",
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("redirectUrl" in result) ||
        typeof result.redirectUrl !== "string"
      ) {
        throw new Error("Unable to connect Gmail. Try again.");
      }
      window.location.assign(result.redirectUrl);
    } catch {
      setConnectError("Unable to connect Gmail. Try again.");
      setConnecting(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-border/50 bg-muted/10"
      aria-labelledby="gmail-heading"
    >
      <div className="border-b border-border/50 px-4 py-3">
        <h2
          id="gmail-heading"
          className="flex items-center gap-2.5 text-sm font-medium"
        >
          <Mail className="size-4" aria-hidden="true" /> Gmail
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Read emails and prepare replies in chat. Creating drafts and sending
          emails require your approval.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground" role="status">
          {isLoading
            ? "Checking connection…"
            : error
              ? "Unable to check Gmail connection."
              : !data?.enabled
                ? "Gmail is not configured yet."
                : data.status === "connected"
                  ? "Connected"
                  : "Not connected"}
        </p>
        {error ? (
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Retry
          </Button>
        ) : data?.enabled && data.status !== "connected" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={connecting}
            onClick={() => void connect()}
          >
            {connecting ? "Connecting…" : "Connect Gmail"}
          </Button>
        ) : null}
        {connectError && (
          <p role="alert" className="w-full text-xs text-destructive">
            {connectError}
          </p>
        )}
      </div>
    </section>
  );
}
