import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        d="M16 2L29 9.5L16 17L3 9.5L16 2ZM16 6.6L11 9.5L16 12.4L21 9.5L16 6.6Z"
        fill={props.color ?? "currentColor"}
        fillRule="evenodd"
      />
      <path
        d="M3 16L16 23.5L29 16M3 22.5L16 30L29 22.5"
        stroke={props.color ?? "currentColor"}
        strokeWidth="2.4"
        strokeLinejoin="round"
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
      <BrandMark className="size-[22px]" />
      <span className="text-[15px] font-semibold tracking-tight">
        Launchstack
      </span>
    </span>
  );
}
