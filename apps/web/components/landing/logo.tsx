import { cn } from "@/lib/utils";

export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 17L10 11L4 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 19H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { readonly className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      aria-label="Launchstack"
    >
      <BrandMark className="h-[18px] w-[18px]" />
      <span className="text-[15px] font-semibold tracking-tight">
        Launchstack
      </span>
    </span>
  );
}
