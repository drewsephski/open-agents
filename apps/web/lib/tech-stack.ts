import { z } from "zod";

export const techStackTechnologySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  logo: z.url(),
});

export const techStackRecommendationSchema = z.object({
  headline: z.string().min(1).max(70),
  summaryMarkdown: z.string().min(1).max(500),
  technologies: z.array(techStackTechnologySchema).min(2).max(8),
  tradeoffMarkdown: z.string().min(1).max(220),
});

export type TechStackRecommendation = z.infer<
  typeof techStackRecommendationSchema
>;
