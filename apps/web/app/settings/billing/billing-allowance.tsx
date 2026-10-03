import {
  getAllowancePercent,
  getAllowancePresentation,
} from "@/lib/access/access-ui";
import { cn } from "@/lib/utils";

export function BillingAllowance({
  label,
  used,
  limit,
  display,
  kind,
}: {
  label: string;
  used: number;
  limit: number;
  display: string;
  kind: "inference" | "sandbox";
}) {
  const percent = getAllowancePercent(used, limit);
  const presentation = getAllowancePresentation(percent, kind);
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full bg-foreground",
            presentation.tone === "warning" && "bg-amber-500",
            presentation.tone === "action" && "bg-destructive",
          )}
          style={{ width: String(percent) + "%" }}
        />
      </div>
      {presentation.message && (
        <p
          className={cn(
            "text-pretty text-xs text-muted-foreground",
            presentation.tone === "warning" &&
              "text-amber-700 dark:text-amber-400",
            presentation.tone === "action" && "text-destructive",
          )}
        >
          {presentation.message}
        </p>
      )}
    </div>
  );
}
