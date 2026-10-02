import Image from "next/image";

export function ProductArt() {
  return (
    <div className="relative mx-auto w-full max-w-[420px] lg:max-w-[520px]">
      <Image
        src="/brand/product-workspace.webp"
        alt="Three floating graphite and glass workspace layers with an orange illuminated edge"
        width={1024}
        height={1024}
        sizes="(min-width: 1024px) 40vw, (min-width: 640px) 420px, 80vw"
        className="h-auto w-full"
        priority
      />
    </div>
  );
}
