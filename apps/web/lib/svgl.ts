import { z } from "zod";
import bundledCatalog from "./svgl-catalog.json";

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
  // Snapshot of the official API, fetched October 2, 2026 (MIT license colocated).
  // Vercel egress can receive 403 even when the public API is reachable elsewhere.
  let parsedCatalog;
  try {
    const response = await fetch(SVGL_API_URL, {
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("catalog_unavailable");
    parsedCatalog = z.array(svglEntrySchema).parse(await response.json());
  } catch {
    console.warn("SVGL API unavailable; using the bundled official catalog");
    parsedCatalog = z.array(svglEntrySchema).parse(bundledCatalog);
  }
  return parsedCatalog.map((entry) => ({
    id: String(entry.id),
    name: entry.title,
    role: Array.isArray(entry.category)
      ? entry.category.join(" · ")
      : entry.category,
    logo: selectLightBackgroundLogo(entry.route),
  }));
}
