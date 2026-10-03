"use client";

import {
  SANDBOX_OPTIONS,
  isAvailableSandboxType,
  type SandboxType,
} from "@/lib/sandbox-options";
import { SandboxProviderLogo } from "./sandbox-provider-logo";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function SandboxPreferenceSelect({
  value,
  onChange,
  disabled,
}: {
  value: SandboxType;
  onChange: (value: SandboxType) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (isAvailableSandboxType(nextValue)) onChange(nextValue);
      }}
      disabled={disabled}
    >
      <SelectTrigger id="sandbox" className="w-full">
        <SelectValue placeholder="Select a sandbox" />
      </SelectTrigger>
      <SelectContent position="popper">
        {(["available", "coming-soon"] as const).map((status) => (
          <SelectGroup key={status}>
            {status === "coming-soon" && <SelectSeparator />}
            <SelectLabel>
              {status === "available" ? "Available" : "Coming soon"}
            </SelectLabel>
            {SANDBOX_OPTIONS.filter((option) => option.status === status).map(
              (option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  textValue={option.name}
                  disabled={option.status === "coming-soon"}
                  className="py-2 data-[disabled]:opacity-70 *:[span]:last:w-full"
                >
                  <SandboxProviderLogo option={option} />
                  <span>{option.name}</span>
                  {option.status === "coming-soon" && (
                    <span className="ml-auto whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </SelectItem>
              ),
            )}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
