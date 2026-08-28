import { z } from "zod";

const SVGL_API_URL = "https://api.svgl.app";

const themeRouteSchema = z.object({
  dark: z.url(),
  light: z.url(),
});

const svglEntrySchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  category: z.union([z.string(), z.array(z.string())]),
  route: z.union([z.url(), themeRouteSchema]),
});

export type SvglTechnology = {
  id: string;
  name: string;
  role: string;
  logo: string;
};

export function selectLightBackgroundLogo(
  route: z.infer<typeof svglEntrySchema>["route"],
): string {
  return typeof route === "string" ? route : route.light;
}

export async function getSvglCatalog(): Promise<SvglTechnology[]> {
  const response = await fetch(SVGL_API_URL, {
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) {
    throw new Error(`SVGL catalog request failed with ${response.status}`);
  }

  const parsedCatalog = z.array(svglEntrySchema).parse(await response.json());
  return parsedCatalog.map((entry) => ({
    id: String(entry.id),
    name: entry.title,
    role: Array.isArray(entry.category)
      ? entry.category.join(" · ")
      : entry.category,
    logo: selectLightBackgroundLogo(entry.route),
  }));
}
