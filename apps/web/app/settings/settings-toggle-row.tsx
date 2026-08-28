import type { ComponentProps, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface SettingsToggleRowProps {
  id: string;
  label: string;
  description: ReactNode;
  checked: boolean;
  onCheckedChange: ComponentProps<typeof Switch>["onCheckedChange"];
  disabled?: boolean;
}

export function SettingsToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: SettingsToggleRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
