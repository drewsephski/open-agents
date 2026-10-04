"use client";

import { useState } from "react";
import { isLocalHelpCommand } from "@/lib/chat/commands";

export function useChatCommandHelp() {
  const [helpOpen, setHelpOpen] = useState(false);
  const handleHelpCommand = (
    text: string,
    hasAttachments: boolean,
  ): boolean => {
    if (!isLocalHelpCommand(text, hasAttachments)) return false;
    setHelpOpen(true);
    return true;
  };
  return { helpOpen, setHelpOpen, handleHelpCommand };
}
