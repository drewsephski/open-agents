interface PackageManifest {
  engines?: { node?: unknown };
  packageManager?: unknown;
}

export interface RuntimeRequirements {
  nodeMajor?: number;
  pnpmPackage?: string;
}

const EXACT_NODE_VERSION = /^(\d+)(?:\.(?:\d+|x|\*)){0,2}$/;
const PINNED_PNPM = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+.*)?$/;

export function parseRuntimeRequirements(
  packageJson: string,
): RuntimeRequirements {
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(packageJson) as PackageManifest;
  } catch {
    return {};
  }

  const requirements: RuntimeRequirements = {};
  const nodeVersion = manifest.engines?.node;
  if (typeof nodeVersion === "string") {
    const match = EXACT_NODE_VERSION.exec(nodeVersion.trim());
    if (match?.[1]) requirements.nodeMajor = Number(match[1]);
  }

  if (typeof manifest.packageManager === "string") {
    const match = PINNED_PNPM.exec(manifest.packageManager.trim());
    if (match?.[1]) requirements.pnpmPackage = `pnpm@${match[1]}`;
  }

  return requirements;
}
