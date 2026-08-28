"use client";

import { ArrowRight, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import { Streamdown } from "streamdown";
import {
  type TechStackRecommendation,
  techStackRecommendationSchema,
} from "@/lib/tech-stack";

const starterRequest =
  "A subscription analytics dashboard for small SaaS teams with billing, live metrics, and weekly email reports.";

const initialRecommendation: TechStackRecommendation = {
  headline: "A focused SaaS foundation",
  summaryMarkdown:
    "A typed full-stack app connects a responsive interface to managed data, billing, and low-friction deployment.\n\n**How it connects**\n- Next.js owns the product surface and server logic.\n- Neon stores subscription and analytics data.\n- Stripe remains the billing system of record.",
  technologies: [
    {
      id: "439",
      name: "Next.js",
      role: "Framework · Vercel",
      logo: "https://svgl.app/library/nextjs_icon_dark.svg",
    },
    {
      id: "112",
      name: "TypeScript",
      role: "Language",
      logo: "https://svgl.app/library/typescript.svg",
    },
    {
      id: "77",
      name: "Tailwind CSS",
      role: "Framework",
      logo: "https://svgl.app/library/tailwindcss.svg",
    },
    {
      id: "253",
      name: "Neon",
      role: "Database",
      logo: "https://svgl.app/library/neon.svg",
    },
    {
      id: "650",
      name: "Stripe",
      role: "Software · Payment",
      logo: "https://svgl.app/library/stripe.svg",
    },
    {
      id: "556",
      name: "Vercel",
      role: "Hosting · Vercel",
      logo: "https://svgl.app/library/vercel.svg",
    },
  ],
  tradeoffMarkdown:
    "Optimized for a small product team; very high event volume may eventually need a separate analytics pipeline.",
};

export function TechSelector() {
  const [request, setRequest] = useState(starterRequest);
  const [recommendation, setRecommendation] = useState(initialRecommendation);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.trim().length < 12 || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/recommend-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to recommend a stack.";
        throw new Error(message);
      }

      const parsedRecommendation =
        techStackRecommendationSchema.safeParse(payload);
      if (!parsedRecommendation.success) {
        throw new Error(
          "The recommendation came back in an unexpected format.",
        );
      }
      setRecommendation(parsedRecommendation.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to recommend a stack.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="border-y border-(--l-border)" id="stack-selector">
      <div className="mx-auto max-w-[1320px] px-6 py-20 sm:py-28">
        <div className="mb-10 grid gap-5 md:grid-cols-[0.8fr_1.2fr] md:items-end">
          <div>
            <div className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-(--l-fg-3)">
              Architecture, on demand
            </div>
            <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tighter sm:text-5xl">
              Describe the product. Get the stack.
            </h2>
          </div>
          <p className="max-w-xl text-balance text-base leading-relaxed text-(--l-fg-2) md:justify-self-end md:text-lg">
            Skip the framework comparison spiral. AI weighs the product shape,
            team constraints, and operating cost to recommend a lean starting
            architecture.
          </p>
        </div>

        <div className="grid overflow-hidden border border-(--l-border) bg-(--l-surface) shadow-[0_36px_90px_rgba(0,0,0,0.07)] lg:grid-cols-[0.86fr_1.14fr]">
          <form
            onSubmit={handleSubmit}
            className="flex min-h-[470px] flex-col border-b border-(--l-border) p-5 sm:p-8 lg:border-b-0 lg:border-r"
          >
            <div className="flex items-center justify-between border-b border-(--l-border-subtle) pb-4 text-xs text-(--l-fg-3)">
              <span className="font-mono uppercase tracking-[0.16em]">
                Product brief
              </span>
              <button
                className="flex items-center gap-1.5 transition-colors hover:text-(--l-fg)"
                type="button"
                onClick={() => setRequest(starterRequest)}
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            </div>
            <label className="sr-only" htmlFor="stack-request">
              Describe the product you want to build
            </label>
            <textarea
              id="stack-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              maxLength={1200}
              className="min-h-56 flex-1 resize-none bg-transparent py-6 text-xl leading-relaxed text-(--l-fg) outline-none placeholder:text-(--l-fg-4) sm:text-2xl"
              placeholder="What are you building? Include users, key workflows, and constraints..."
            />
            <div aria-live="polite" className="min-h-6 text-sm text-red-600">
              {error}
            </div>
            <div className="flex items-center justify-between gap-4 pt-3">
              <span className="font-mono text-[11px] text-(--l-fg-4)">
                {request.length.toString().padStart(3, "0")} / 1200
              </span>
              <button
                type="submit"
                disabled={isLoading || request.trim().length < 12}
                className="group flex h-11 items-center gap-3 bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) transition-all hover:bg-(--l-btn-hover) disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4 transition-transform duration-300 ease-out motion-safe:group-hover:rotate-12 motion-safe:group-hover:scale-125 motion-safe:group-hover:[animation:stack-sparkle_900ms_ease-in-out_infinite]" />
                )}
                {isLoading ? "Composing" : "Recommend my stack"}
                {!isLoading && (
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </div>
          </form>

          <div className="relative min-h-[470px] overflow-hidden bg-[#11110f] p-5 text-white sm:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.1)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
                <span>Recommended system</span>
                <span className="flex items-center gap-2">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  AI composed
                </span>
              </div>

              <div className="py-7">
                <h3 className="text-2xl font-medium tracking-tight sm:text-3xl">
                  {recommendation.headline}
                </h3>
                <div className="mt-3 max-w-xl text-sm leading-relaxed text-white/75 [&_p]:my-2 [&_strong]:font-medium [&_strong]:text-white [&_ul]:mt-2 [&_ul]:space-y-1 [&_ul]:pl-4 [&_li]:list-disc [&_li::marker]:text-emerald-400">
                  <Streamdown mode="static" isAnimating={false}>
                    {recommendation.summaryMarkdown}
                  </Streamdown>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3">
                {recommendation.technologies.map((technology, index) => (
                  <div
                    key={technology.id}
                    className="group relative min-h-28 bg-[#11110f] p-4 transition-colors hover:bg-white/[0.06]"
                    style={{ animationDelay: `${index * 55}ms` }}
                  >
                    <div className="flex size-9 items-center justify-center rounded-md border border-white/15 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
                      <Image
                        src={technology.logo}
                        alt=""
                        width={24}
                        height={24}
                        className="size-6 object-contain"
                      />
                    </div>
                    <p className="mt-3 text-sm font-medium text-white">
                      {technology.name}
                    </p>
                    <p className="mt-0.5 text-xs text-white/60">
                      {technology.role}
                    </p>
                    <span className="absolute right-3 top-3 font-mono text-[9px] text-white/35">
                      0{index + 1}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-amber-300/70">
                  Main tradeoff
                </p>
                <div className="mt-2 text-sm leading-relaxed text-white/65 [&_strong]:font-medium [&_strong]:text-white">
                  <Streamdown mode="static" isAnimating={false}>
                    {recommendation.tradeoffMarkdown}
                  </Streamdown>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-right text-[11px] text-(--l-fg-4)">
          Technology marks provided by SVGL.
        </p>
      </div>
    </section>
  );
}
