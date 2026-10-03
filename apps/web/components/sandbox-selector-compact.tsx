"use client";

import { useState } from "react";
import { ChevronDown, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SANDBOX_TYPE,
  SANDBOX_OPTIONS,
  type SandboxType,
} from "@/lib/sandbox-options";
import { SandboxProviderLogo } from "./sandbox-provider-logo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export {
  DEFAULT_SANDBOX_TYPE,
  SANDBOX_OPTIONS,
  type SandboxType,
} from "@/lib/sandbox-options";

interface SandboxSelectorCompactProps {
  value: SandboxType;
  onChange: (sandboxType: SandboxType) => void;
}

export function SandboxSelectorCompact({
  value,
  onChange,
}: SandboxSelectorCompactProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (sandboxType: SandboxType) => {
    onChange(sandboxType);
    setOpen(false);
  };

  const selectedSandbox = SANDBOX_OPTIONS.find((s) => s.id === value);
  const displayText = selectedSandbox?.name ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Select a sandbox"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {selectedSandbox && (
            <SandboxProviderLogo option={selectedSandbox} className="size-4" />
          )}
          <span className="max-w-[100px] truncate">{displayText}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No sandbox types found.</CommandEmpty>
            <CommandGroup>
              {SANDBOX_OPTIONS.map((sandbox) => (
                <CommandItem
                  key={sandbox.id}
                  value={sandbox.id}
                  disabled={sandbox.status === "coming-soon"}
                  onSelect={() => {
                    if (sandbox.status === "available")
                      handleSelect(sandbox.id);
                  }}
                  className="data-[disabled=true]:opacity-70"
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      value === sandbox.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <SandboxProviderLogo option={sandbox} className="mr-2" />
                  <div className="flex flex-col">
                    <span>{sandbox.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {sandbox.description}
                    </span>
                  </div>
                  {sandbox.id === DEFAULT_SANDBOX_TYPE && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      default
                    </span>
                  )}
                  {sandbox.status === "coming-soon" && (
                    <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
