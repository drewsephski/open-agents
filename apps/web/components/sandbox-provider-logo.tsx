import Image from "next/image";
import type { SandboxOption } from "@/lib/sandbox-options";
import { cn } from "@/lib/utils";

export function SandboxProviderLogo({
  option,
  className,
}: {
  option: SandboxOption;
  className?: string;
}) {
  if (option.id === "vercel") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={cn("size-5 shrink-0", className)}
      >
        <path d="M12 1L24 22H0L12 1Z" />
      </svg>
    );
  }

  if (!option.logo) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-5 shrink-0",
        option.id === "beam" && "rounded-sm bg-white p-0.5",
        className,
      )}
    >
      <Image
        src={option.logo}
        alt=""
        width={20}
        height={20}
        unoptimized
        className={cn(
          "size-full object-contain",
          option.darkLogo && "dark:hidden",
        )}
      />
      {option.darkLogo && (
        <Image
          src={option.darkLogo}
          alt=""
          width={20}
          height={20}
          unoptimized
          className="hidden size-full object-contain dark:block"
        />
      )}
    </span>
  );
}
