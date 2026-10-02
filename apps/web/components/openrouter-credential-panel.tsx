"use client";

import { CheckCircle2, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyAccessChanged } from "@/hooks/use-access-summary";
import type { SafeCredentialState } from "@/lib/access/access-ui";
import {
  getCredentialActionCopy,
  getCredentialErrorMessage,
} from "@/lib/credentials/credential-ui";
import { cn } from "@/lib/utils";

export interface SafeCredentialStatus {
  state: SafeCredentialState;
  label: string | null;
  lastFour: string | null;
  validatedAt: string | null;
}

const MISSING_STATUS: SafeCredentialStatus = {
  state: "missing",
  label: null,
  lastFour: null,
  validatedAt: null,
};

export function OpenRouterCredentialPanel({
  compact = false,
  dark = false,
  onStatusChange,
}: {
  compact?: boolean;
  dark?: boolean;
  onStatusChange?: (status: SafeCredentialStatus) => void;
}) {
  const [status, setStatus] = useState<SafeCredentialStatus>(MISSING_STATUS);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const actionCopy = getCredentialActionCopy(status.state);

  const updateStatus = useCallback(
    (nextStatus: SafeCredentialStatus) => {
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/settings/provider-credentials/openrouter", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          credential?: SafeCredentialStatus;
        };
        if (!response.ok || !payload.credential) throw new Error("load_failed");
        if (active) updateStatus(payload.credential);
      })
      .catch(() => {
        if (active) setError("Could not load API key status. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [updateStatus]);

  const save = async () => {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/settings/provider-credentials/openrouter",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey.trim() }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        credential?: SafeCredentialStatus;
        error?: { code?: string };
      } | null;
      if (!response.ok || !payload?.credential) {
        throw new Error(payload?.error?.code ?? "credential_update_failed");
      }
      setApiKey("");
      updateStatus(payload.credential);
      notifyAccessChanged();
    } catch (caught) {
      setError(
        getCredentialErrorMessage(
          caught instanceof Error ? caught.message : undefined,
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const response = await fetch(
        "/api/settings/provider-credentials/openrouter",
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        credential?: SafeCredentialStatus;
        error?: { code?: string };
      } | null;
      if (!response.ok || !payload?.credential) {
        throw new Error(payload?.error?.code ?? "credential_delete_failed");
      }
      updateStatus(payload.credential);
      setRemoveOpen(false);
      notifyAccessChanged();
    } catch (caught) {
      setRemoveError(
        getCredentialErrorMessage(
          caught instanceof Error ? caught.message : undefined,
        ),
      );
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return <Skeleton className={cn("h-32 w-full", dark && "bg-white/5")} />;
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border p-4",
        dark ? "border-white/10 bg-white/[0.02]" : "border-border bg-card",
        compact && "rounded-lg p-3",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <KeyRound
            className={cn(
              "mt-0.5 size-5 shrink-0",
              dark ? "text-zinc-400" : "text-muted-foreground",
            )}
          />
          <div className="min-w-0">
            <h2
              className={cn(
                "text-balance font-medium",
                dark ? "text-zinc-100" : "text-foreground",
              )}
            >
              OpenRouter
            </h2>
            <p
              className={cn(
                "mt-1 text-pretty text-sm",
                dark ? "text-zinc-500" : "text-muted-foreground",
              )}
            >
              Add a write-only API key for the free BYOK plan and Pro fallback.
            </p>
          </div>
        </div>
        {status.state === "valid" && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Connected
          </span>
        )}
      </div>

      {status.state === "valid" && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm",
            dark ? "bg-white/5 text-zinc-300" : "bg-muted text-foreground",
          )}
        >
          <span className="min-w-0 truncate">
            {status.label ?? "OpenRouter key"} ending in{" "}
            <span className="font-mono tabular-nums">{status.lastFour}</span>
          </span>
          {status.validatedAt && (
            <span className="text-xs text-muted-foreground">
              Validated {new Date(status.validatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor={compact ? "onboarding-openrouter-key" : "openrouter-key"}
          className={cn(
            "text-sm font-medium",
            dark ? "text-zinc-300" : "text-foreground",
          )}
        >
          {actionCopy.inputLabel}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={compact ? "onboarding-openrouter-key" : "openrouter-key"}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-or-v1-…"
            disabled={saving || removing}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "openrouter-key-error" : undefined}
            className={cn(dark && "border-zinc-700 bg-zinc-950 text-white")}
          />
          <Button
            type="button"
            variant={dark ? "secondary" : "default"}
            disabled={!apiKey.trim() || saving || removing}
            onClick={() => void save()}
          >
            {saving ? "Validating…" : actionCopy.action}
          </Button>
        </div>
        <p
          className={cn(
            "text-pretty text-xs",
            dark ? "text-zinc-600" : "text-muted-foreground",
          )}
        >
          Your key is encrypted and never shown again after validation.{" "}
          <Link
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            Create a key <ExternalLink className="size-3" />
          </Link>
        </p>
        {error && (
          <p
            id="openrouter-key-error"
            role="alert"
            className="text-pretty text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      {status.state === "valid" && (
        <AlertDialog
          open={removeOpen}
          onOpenChange={(open) => {
            setRemoveOpen(open);
            if (!open) setRemoveError(null);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <Trash2 className="size-4" />
              Remove API key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-balance">
                Remove OpenRouter API key?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-pretty">
                BYOK inference will stop. Pro can continue with managed
                inference until its allowance is used.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeError && (
              <p role="alert" className="text-pretty text-sm text-destructive">
                {removeError}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={removing}
                onClick={() => void remove()}
              >
                {removing ? "Removing…" : "Remove key"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
