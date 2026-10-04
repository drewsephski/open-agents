"use client";
import { useState } from "react";
import useSWR from "swr";
import { DEFAULT_STACK_ID } from "@/lib/stacks/schema";
import { launchReadinessSchema } from "@/lib/stacks/readiness";
import type { ActionAccountIds } from "@/lib/actions/bindings";
import type { ActionToolkit } from "@/lib/actions/registry";

export function useLaunchReadiness(params: {
  versionId: string;
  repository?: { owner: string; repo: string };
  enabled: boolean;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
}) {
  const [selection, setSelection] = useState<{
    versionId: string;
    ids: ActionAccountIds;
  }>();
  const ids = selection?.versionId === params.versionId ? selection.ids : {};
  const body = JSON.stringify({
    stackVersionId:
      params.versionId === DEFAULT_STACK_ID ? undefined : params.versionId,
    repository: params.repository,
    autoCommitPush: params.autoCommitPush,
    autoCreatePr: params.autoCreatePr,
    actionAccountIds: ids,
  });
  const { data, error, isLoading, mutate } = useSWR(
    params.enabled ? ["/api/stacks/readiness", body] : null,
    async ([url, payload]: [string, string]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok)
        throw new Error("Unable to verify launch readiness. Try again.");
      return launchReadinessSchema.parse(await response.json());
    },
  );
  const accountIds: ActionAccountIds = {};
  for (const toolkit of ["gmail", "linear"] as const) {
    if (data?.bindings[toolkit])
      accountIds[toolkit] = data.bindings[toolkit].accountId;
  }
  return {
    data,
    error,
    isLoading,
    accountIds,
    refresh: mutate,
    selectAccount(toolkit: ActionToolkit, accountId: string) {
      setSelection({
        versionId: params.versionId,
        ids: { ...ids, [toolkit]: accountId },
      });
    },
  };
}
