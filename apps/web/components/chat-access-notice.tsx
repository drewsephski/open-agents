import { AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AccessSummary } from "@/lib/access/access-ui";
import { cn } from "@/lib/utils";

export function ChatAccessNotice({
  summary,
  pending,
  checking,
  onResend,
}: {
  summary: AccessSummary | null;
  pending: boolean;
  checking: boolean;
  onResend: () => void;
}) {
  const allowanceWarning =
    summary?.managedInference.warning === "prominent" ||
    summary?.managedInference.warning === "exhausted" ||
    summary?.sandbox.warning === "prominent" ||
    summary?.sandbox.warning === "exhausted";
  const passiveWarning =
    summary?.managedInference.warning === "passive" ||
    summary?.sandbox.warning === "passive";

  if (!pending && !allowanceWarning && !passiveWarning) return null;

  const eligible = summary?.eligible ?? false;
  const actionable = pending || allowanceWarning;
  const usingFallback =
    summary?.managedInference.warning === "exhausted" &&
    summary.inferenceSource === "byok";

  return (
    <div
      role="status"
      className={cn(
        "mb-2 flex items-start gap-3 rounded-lg border p-3 text-sm",
        actionable
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-border bg-muted/50",
      )}
    >
      {actionable ? (
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {pending
            ? "Pending prompt saved on this device"
            : usingFallback
              ? "Managed inference used, BYOK fallback active"
              : allowanceWarning
                ? "You are close to an allowance limit"
                : "You have used at least 75% of an allowance"}
        </p>
        <p className="text-pretty text-xs text-muted-foreground">
          {pending
            ? eligible
              ? "Access is ready. Resend only when you choose."
              : "Add an OpenRouter key or upgrade. This prompt will not send automatically."
            : "Review exact usage and reset timing in Billing before starting more work."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pending && eligible && (
            <Button
              type="button"
              size="sm"
              onClick={onResend}
              disabled={checking}
            >
              Resend pending prompt
            </Button>
          )}
          {(!eligible || allowanceWarning) && (
            <>
              {!eligible ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href="/settings/connections">Add API key</Link>
                </Button>
              ) : (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href="/settings/connections">Manage API key</Link>
                </Button>
              )}
              <Button asChild type="button" size="sm" variant="outline">
                <Link href="/settings/billing">
                  {summary?.plan.id === "pro" ? "View billing" : "Upgrade"}
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
