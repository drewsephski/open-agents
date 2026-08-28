import { z } from "zod";

export const technologies = [
  {
    id: "nextjs",
    name: "Next.js",
    role: "Full-stack framework",
    logo: "https://svgl.app/library/nextjs_icon_dark.svg",
  },
  {
    id: "react",
    name: "React",
    role: "Web interface",
    logo: "https://svgl.app/library/react_light.svg",
  },
  {
    id: "typescript",
    name: "TypeScript",
    role: "Application language",
    logo: "https://svgl.app/library/typescript.svg",
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    role: "Styling system",
    logo: "https://svgl.app/library/tailwindcss.svg",
  },
  {
    id: "postgresql",
    name: "PostgreSQL",
    role: "Relational database",
    logo: "https://svgl.app/library/postgresql.svg",
  },
  {
    id: "supabase",
    name: "Supabase",
    role: "Backend platform",
    logo: "https://svgl.app/library/supabase.svg",
  },
  {
    id: "neon",
    name: "Neon",
    role: "Serverless Postgres",
    logo: "https://svgl.app/library/neon.svg",
  },
  {
    id: "vercel",
    name: "Vercel",
    role: "Deployment platform",
    logo: "https://svgl.app/library/vercel.svg",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    role: "Edge platform",
    logo: "https://svgl.app/library/cloudflare.svg",
  },
  {
    id: "expo",
    name: "Expo",
    role: "Native app platform",
    logo: "https://svgl.app/library/expo.svg",
  },
  {
    id: "stripe",
    name: "Stripe",
    role: "Payments",
    logo: "https://svgl.app/library/stripe.svg",
  },
  {
    id: "python",
    name: "Python",
    role: "Backend language",
    logo: "https://svgl.app/library/python.svg",
  },
  {
    id: "fastapi",
    name: "FastAPI",
    role: "Python API framework",
    logo: "https://svgl.app/library/fastapi.svg",
  },
] as const;

const technologyIds = technologies.map(({ id }) => id) as [
  (typeof technologies)[number]["id"],
  ...(typeof technologies)[number]["id"][],
];

export const technologyIdSchema = z.enum(technologyIds);

export const techStackRecommendationSchema = z.object({
  headline: z.string().min(1).max(80),
  summary: z.string().min(1).max(280),
  technologyIds: z.array(technologyIdSchema).min(4).max(6),
  tradeoff: z.string().min(1).max(180),
});

export type TechStackRecommendation = z.infer<
  typeof techStackRecommendationSchema
>;
