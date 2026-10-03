import "server-only";
import { posix } from "node:path";
import type { Sandbox } from "@open-agents/sandbox";
import {
  buildDevelopmentDotenvFromVercelProject,
  getVercelProjectRootDirectory,
} from "@/lib/vercel/projects";
import { getUserVercelToken } from "@/lib/vercel/token";
import { shellEscape } from "./home-directory";

export async function syncProjectEnvironment(params: {
  userId: string;
  projectId: string;
  teamId: string | null;
  sandbox: Sandbox;
}): Promise<void> {
  const token = await getUserVercelToken(params.userId);
  if (!token)
    throw new Error(
      "Reconnect Vercel in Connections to sync this project's environment.",
    );

  const project = {
    token,
    projectIdOrName: params.projectId,
    teamId: params.teamId,
  };
  let dotenv: string;
  let rootDirectory: string | null;
  try {
    [dotenv, rootDirectory] = await Promise.all([
      buildDevelopmentDotenvFromVercelProject(project),
      getVercelProjectRootDirectory(project),
    ]);
  } catch {
    throw new Error(
      "Could not read this project's Development environment. Reconnect Vercel in Connections and check project access.",
    );
  }

  const workspace = posix.resolve(params.sandbox.workingDirectory);
  const projectDirectory = posix.resolve(workspace, rootDirectory || ".");
  if (
    projectDirectory !== workspace &&
    !projectDirectory.startsWith(`${workspace}/`)
  ) {
    throw new Error(
      "The Vercel project root must be inside the repository workspace.",
    );
  }
  // An empty Development environment must not overwrite a repository's env file.
  if (!dotenv) return;
  const envPath = posix.join(projectDirectory, ".env.local");
  const relativeEnvPath = posix.relative(workspace, envPath);
  const protection = await params.sandbox.exec(
    `if git ls-files --error-unmatch -- ${shellEscape(relativeEnvPath)} >/dev/null 2>&1; then exit 1; fi\nprintf '\\n**/.env.local\\n' >> "$(git rev-parse --git-path info/exclude)"`,
    workspace,
    5_000,
  );
  if (!protection.success) {
    throw new Error(
      "Environment sync requires an untracked .env.local file excluded from Git.",
    );
  }
  await params.sandbox.writeFile(envPath, dotenv, "utf-8");
}
