"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/app/providers";
import { cn } from "@/lib/utils";

type ThemeToggleButtonProps = {
  className?: string;
};

export function ThemeToggleButton({ className }: ThemeToggleButtonProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "shrink-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
