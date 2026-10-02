import Image from "next/image";
import { cn } from "@/lib/utils";

export type FeatureIconName =
  | "agent"
  | "sandbox"
  | "workflow"
  | "feature"
  | "repair"
  | "checks"
  | "parallel";

export function FeatureIcon({
  name,
  className,
}: {
  readonly name: FeatureIconName;
  readonly className?: string;
}) {
  return (
    <Image
      src={`/brand/icons/${name}.svg`}
      alt=""
      width={48}
      height={48}
      className={cn("size-12", className)}
    />
  );
}
