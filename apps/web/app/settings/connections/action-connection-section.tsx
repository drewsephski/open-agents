"use client";

import { useState } from "react";
import { Mail, CircleDot } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/swr";

import { ACTION_TOOLKITS, type ActionToolkit } from "@/lib/actions/registry";

export function ActionConnectionSection({
  toolkit,
}: {
  toolkit: ActionToolkit;
}) {
  const { label, description } = ACTION_TOOLKITS[toolkit];
  const endpoint = `/api/connections/${toolkit}`;
  const { data, error, isLoading, mutate } = useSWR<{
    enabled: boolean;
    status: "connected" | "not_connected";
  }>(endpoint, fetcher);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string>();

  async function connect() {
    setConnecting(true);
    setConnectError(undefined);
    try {
      const response = await fetch(endpoint, {
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
        throw new Error(`Unable to connect ${label}. Try again.`);
      }
      window.location.assign(result.redirectUrl);
    } catch {
      setConnectError(`Unable to connect ${label}. Try again.`);
      setConnecting(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-border/50 bg-muted/10"
      aria-labelledby={`${toolkit}-heading`}
    >
      <div className="border-b border-border/50 px-4 py-3">
        <h2
          id={`${toolkit}-heading`}
          className="flex items-center gap-2.5 text-sm font-medium"
        >
          {toolkit === "gmail" ? (
            <Mail className="size-4" aria-hidden="true" />
          ) : (
            <CircleDot className="size-4" aria-hidden="true" />
          )}{" "}
          {label}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground" role="status">
          {isLoading
            ? "Checking connection…"
            : error
              ? `Unable to check ${label} connection.`
              : !data?.enabled
                ? `${label} is not configured yet.`
                : data.status === "connected"
                  ? "Connected"
                  : "Not connected"}
        </p>
        {error ? (
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Retry
          </Button>
        ) : data?.enabled ? (
          <Button
            size="sm"
            variant="outline"
            disabled={connecting}
            onClick={() => void connect()}
          >
            {connecting
              ? "Connecting…"
              : data.status === "connected"
                ? `Reconnect ${label}`
                : `Connect ${label}`}
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
