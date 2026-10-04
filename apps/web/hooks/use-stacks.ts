"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import type { StackConfiguration, StackSummary } from "@/lib/stacks/schema";

export interface StacksResponse {
  stacks: StackSummary[];
  defaultConfiguration: StackConfiguration;
}

export function useStacks() {
  const { data, error, isLoading, mutate } = useSWR<StacksResponse>(
    "/api/stacks",
    fetcher,
  );
  return {
    stacks: data?.stacks ?? [],
    defaultConfiguration: data?.defaultConfiguration,
    error,
    loading: isLoading,
    refresh: mutate,
  };
}
