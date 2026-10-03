export type SandboxType = "vercel";

type UpcomingSandboxType =
  | "codesandbox"
  | "modal"
  | "tensorlake"
  | "daytona"
  | "e2b"
  | "blaxel"
  | "beam"
  | "cloudflare"
  | "opensandbox"
  | "microsandbox";

export type SandboxOption = {
  name: string;
  description: string;
  logo?: string;
  darkLogo?: string;
} & (
  | { id: SandboxType; status: "available" }
  | { id: UpcomingSandboxType; status: "coming-soon" }
);

export const DEFAULT_SANDBOX_TYPE: SandboxType = "vercel";

export const SANDBOX_OPTIONS: readonly SandboxOption[] = [
  {
    id: "vercel",
    name: "Vercel",
    description: "Cloud workspace",
    status: "available",
  },
  {
    id: "codesandbox",
    name: "CodeSandbox",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/codesandbox.ico",
  },
  {
    id: "modal",
    name: "Modal",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/modal.svg",
  },
  {
    id: "tensorlake",
    name: "Tensorlake",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/tensorlake.svg",
  },
  {
    id: "daytona",
    name: "Daytona",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/daytona-light.png",
    darkLogo: "/brands/sandboxes/daytona-dark.png",
  },
  {
    id: "e2b",
    name: "E2B",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/e2b-light.svg",
    darkLogo: "/brands/sandboxes/e2b-dark.svg",
  },
  {
    id: "blaxel",
    name: "Blaxel",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/blaxel.svg",
  },
  {
    id: "beam",
    name: "Beam",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/beam.svg",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Cloud workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/cloudflare.svg",
  },
  {
    id: "opensandbox",
    name: "OpenSandbox",
    description: "Self-hosted workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/opensandbox.svg",
  },
  {
    id: "microsandbox",
    name: "microsandbox",
    description: "Self-hosted workspace",
    status: "coming-soon",
    logo: "/brands/sandboxes/microsandbox.png",
  },
];

export function isAvailableSandboxType(value: string): value is SandboxType {
  return SANDBOX_OPTIONS.some(
    (option) => option.id === value && option.status === "available",
  );
}
