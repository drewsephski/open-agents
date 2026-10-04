import type { Metadata } from "next";
import { StacksSection } from "./stacks-section";

export const metadata: Metadata = {
  title: "Stacks",
  description: "Build reusable software-engineering agent Stacks.",
};

export default function StacksPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Stacks</h1>
      <StacksSection />
    </>
  );
}
