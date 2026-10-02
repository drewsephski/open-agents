"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccessSummary } from "@/lib/access/access-ui";

export const ACCESS_CHANGED_EVENT = "launchstack:access-changed";

export function notifyAccessChanged(): void {
  window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
}

export function useAccessSummary(modelId?: string) {
  const [summary, setSummary] = useState<AccessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (modelId?: string): Promise<AccessSummary | null> => {
      try {
        const path = modelId
          ? "/api/settings/access-summary?modelId=" +
            encodeURIComponent(modelId)
          : "/api/settings/access-summary";
        const response = await fetch(path, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          summary?: AccessSummary;
        } | null;
        if (!response.ok || !payload?.summary) {
          throw new Error("access_summary_unavailable");
        }
        setSummary(payload.summary);
        setError(null);
        return payload.summary;
      } catch {
        setError("Could not check inference access. Try again.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh(modelId);
    const handleRefresh = () => void refresh(modelId);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(ACCESS_CHANGED_EVENT, handleRefresh);
    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(ACCESS_CHANGED_EVENT, handleRefresh);
    };
  }, [modelId, refresh]);

  return { summary, loading, error, refresh };
}
