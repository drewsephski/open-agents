"use client";
import { useState } from "react";
import { DEFAULT_STACK_ID, type StackSummary } from "@/lib/stacks/schema";
import { useStacks } from "./use-stacks";

export function useSessionStack() {
  const { stacks, defaultConfiguration, loading, error } = useStacks();
  // Keep the chosen version even if another tab publishes a newer version.
  const [selected, setSelected] = useState<StackSummary | null>(null);
  const choices =
    selected && !stacks.some((stack) => stack.versionId === selected.versionId)
      ? [selected, ...stacks]
      : stacks;
  return {
    choices,
    loading,
    error,
    versionId: selected?.versionId ?? DEFAULT_STACK_ID,
    configuration: selected?.configuration ?? defaultConfiguration,
    selectStack(versionId: string) {
      const stack =
        choices.find((choice) => choice.versionId === versionId) ?? null;
      setSelected(stack);
      return stack?.configuration ?? defaultConfiguration;
    },
  };
}
