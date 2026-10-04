import type { ResolveHook } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Scope this compatibility hook to extensionless local TypeScript imports.
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
    throw error;
  }
};
