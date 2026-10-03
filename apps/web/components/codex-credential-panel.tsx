"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notifyAccessChanged } from "@/hooks/use-access-summary";

const endpoint = "/api/settings/provider-credentials/codex";
async function fetchConnection(
  url: string,
): Promise<{ connection: { connected: boolean } }> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not check your Codex connection.");
  return response.json();
}

export function CodexCredentialPanel() {
  const {
    data,
    error: loadError,
    mutate,
    isLoading,
  } = useSWR(endpoint, fetchConnection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = data?.connection.connected ?? false;

  const update = async (file?: File) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (file && file.size > 65536)
        throw new Error("Choose a Codex login file smaller than 64 KB.");
      const response = await fetch(endpoint, {
        method: file ? "PUT" : "DELETE",
        headers: file ? { "Content-Type": "application/json" } : undefined,
        body: file
          ? JSON.stringify({ authFile: await file.text() })
          : undefined,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Could not update your Codex connection.",
        );
      await mutate(payload);
      notifyAccessChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update your Codex connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Codex subscription · Free</CardTitle>
        <p className="text-pretty text-sm text-muted-foreground">
          Use your existing ChatGPT / Codex subscription. No Launchstack payment
          or OpenRouter key required. OpenAI’s subscription limits still apply.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" className="text-sm">
          {isLoading
            ? "Checking connection…"
            : connected
              ? "Connected. New chats use your Codex subscription."
              : "Connect your existing Codex login to get started."}
        </p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            On your computer, run <code>codex login</code> and sign in with
            ChatGPT. Then select your <code>~/.codex/auth.json</code> file
            below.
          </p>
          <p>
            To find it on macOS, press Command–Shift–G in the file picker and
            enter <code>~/.codex</code>. If your login uses the system keychain,
            run{" "}
            <code>{'codex -c cli_auth_credentials_store="file" login'}</code>{" "}
            first.
          </p>
          <p>
            Your login is encrypted in storage and used only in your cloud
            workspace. Importing a login makes it available to Launchstack;
            never share this file in chat or commit it to a repository.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="codex-auth-file">
            {connected ? "Replace Codex login" : "Codex login file"}
          </Label>
          <Input
            id="codex-auth-file"
            type="file"
            accept=".json,application/json"
            disabled={busy || isLoading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void update(file);
            }}
          />
        </div>
        {(error || loadError) && (
          <p role="alert" className="text-pretty text-sm text-destructive">
            {error ??
              "Could not check your Codex connection. Refresh to try again."}
          </p>
        )}
        {connected && (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/sessions">Start a new Codex chat</Link>
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void update()}
            >
              Disconnect Codex
            </Button>
          </div>
        )}
        <p className="text-pretty text-xs text-muted-foreground">
          Existing chats keep their original backend. Free cloud workspace
          limits apply. Choose Pro only if you want Launchstack to manage AI
          usage.
        </p>
      </CardContent>
    </Card>
  );
}
