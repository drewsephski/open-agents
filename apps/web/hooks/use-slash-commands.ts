import { useState, useMemo, useCallback, useEffect } from "react";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";
import { CHAT_COMMANDS } from "@/lib/chat/commands";
import {
  extractPromptInvocation,
  type PromptInvocation,
} from "@/lib/chat/prompt-invocations";

interface UseSlashCommandsOptions {
  inputValue: string;
  cursorPosition: number;
  skills: SkillSuggestion[] | null;
  onSelect: (
    name: string,
    start: number,
    cursorPos: number,
    prefix: "/" | "$",
  ) => void;
}

interface UseSlashCommandsResult {
  showSlashCommands: boolean;
  slashSuggestions: SkillSuggestion[];
  selectedSlashIndex: number;
  handleSlashKeyDown: (e: React.KeyboardEvent) => boolean;
  slashInfo: PromptInvocation | null;
  closeSlashCommands: () => void;
}

/**
 * Filter skill suggestions based on a partial command string.
 */
export function filterSkillSuggestions(
  skills: SkillSuggestion[],
  partialCommand: string,
  maxResults: number = 20,
): SkillSuggestion[] {
  const query = partialCommand.toLowerCase();

  if (!query) {
    // Show the selected namespace when only its prefix is typed.
    return skills.slice(0, maxResults);
  }

  const results: SkillSuggestion[] = [];
  for (const skill of skills) {
    if (skill.name.toLowerCase().includes(query)) {
      results.push(skill);
      if (results.length >= maxResults) break;
    }
  }
  return results;
}

export function useSlashCommands({
  inputValue,
  cursorPosition,
  skills,
  onSelect,
}: UseSlashCommandsOptions): UseSlashCommandsResult {
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const invocation = useMemo(
    () => extractPromptInvocation(inputValue, cursorPosition),
    [inputValue, cursorPosition],
  );
  const slashInfo = dismissed ? null : invocation;

  // Filter suggestions based on partial command
  const slashSuggestions = useMemo(() => {
    if (!slashInfo) return [];
    return filterSkillSuggestions(
      slashInfo.kind === "command" ? [...CHAT_COMMANDS] : (skills ?? []),
      slashInfo.query,
    );
  }, [slashInfo, skills]);

  const showSlashCommands = slashInfo !== null;

  // Reset state when command changes
  const partialCommand = invocation
    ? `${invocation.start}:${invocation.prefix}${invocation.query}`
    : undefined;
  useEffect(() => {
    setSelectedSlashIndex(0);
    setDismissed(false);
  }, [partialCommand]);

  const closeSlashCommands = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleSlashKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!showSlashCommands) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedSlashIndex((prev) =>
            prev < slashSuggestions.length - 1 ? prev + 1 : prev,
          );
          return true;

        case "ArrowUp":
          e.preventDefault();
          setSelectedSlashIndex((prev) => (prev > 0 ? prev - 1 : prev));
          return true;

        case "Tab":
        case "Enter": {
          const selected = slashSuggestions[selectedSlashIndex];
          if (selected && slashInfo) {
            e.preventDefault();
            onSelect(
              selected.name,
              slashInfo.start,
              cursorPosition,
              slashInfo.prefix,
            );
            setDismissed(true);
            return true;
          }
          return false;
        }

        case "Escape":
          e.preventDefault();
          setDismissed(true);
          return true;

        default:
          return false;
      }
    },
    [
      showSlashCommands,
      slashSuggestions,
      selectedSlashIndex,
      slashInfo,
      cursorPosition,
      onSelect,
    ],
  );

  return {
    showSlashCommands,
    slashSuggestions,
    selectedSlashIndex,
    handleSlashKeyDown,
    slashInfo,
    closeSlashCommands,
  };
}
