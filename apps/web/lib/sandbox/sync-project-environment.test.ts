import { beforeEach, expect, mock, test } from "bun:test";
import type { Sandbox } from "@open-agents/sandbox";

mock.module("server-only", () => ({}));
let token: string | null = "access-token";
let dotenv = 'API_URL="https://development.example.com"\n';
let rootDirectory: string | null = "apps/web";
let projectError = false;
let projectReads = 0;
let gitProtectionSucceeds = true;
const writes: unknown[][] = [];

mock.module("@/lib/vercel/token", () => ({
  getUserVercelToken: async () => token,
}));
mock.module("@/lib/vercel/projects", () => ({
  buildDevelopmentDotenvFromVercelProject: async () => {
    projectReads += 1;
    if (projectError) throw new Error("Provider detail with secret-value");
    return dotenv;
  },
  getVercelProjectRootDirectory: async () => rootDirectory,
}));

const { syncProjectEnvironment } = await import("./sync-project-environment");
const sandbox = {
  workingDirectory: "/workspace/repo",
  exec: async () => ({ success: gitProtectionSucceeds }),
  writeFile: async (...args: unknown[]) => {
    writes.push(args);
  },
} as unknown as Sandbox;
const input = {
  userId: "user-1",
  projectId: "project-1",
  teamId: "team-1",
  sandbox,
};

beforeEach(() => {
  token = "access-token";
  dotenv = 'API_URL="https://development.example.com"\n';
  rootDirectory = "apps/web";
  projectError = false;
  projectReads = 0;
  gitProtectionSucceeds = true;
  writes.length = 0;
});

test("writes Development variables in a monorepo project's root", async () => {
  await syncProjectEnvironment(input);
  expect(writes).toEqual([
    ["/workspace/repo/apps/web/.env.local", dotenv, "utf-8"],
  ]);
});

test("uses the repository root when Vercel has no root directory", async () => {
  rootDirectory = null;
  await syncProjectEnvironment(input);
  expect(writes[0]?.[0]).toBe("/workspace/repo/.env.local");
});

test("does not erase existing env files when no Development variables exist", async () => {
  dotenv = "";
  await syncProjectEnvironment(input);
  expect(writes).toHaveLength(0);
});

test("rejects project roots outside the repository", async () => {
  rootDirectory = "../escape";
  await expect(syncProjectEnvironment(input)).rejects.toThrow(
    "inside the repository",
  );
  expect(writes).toHaveLength(0);
});

test("asks for reconnect when credentials are missing", async () => {
  token = null;
  await expect(syncProjectEnvironment(input)).rejects.toThrow(
    "Reconnect Vercel",
  );
  expect(projectReads).toBe(0);
});

test("does not expose provider errors or secret values", async () => {
  projectError = true;
  await expect(syncProjectEnvironment(input)).rejects.toThrow(
    "Could not read this project's Development environment.",
  );
  expect(writes).toHaveLength(0);
});

test("never writes secrets when Git exclusion cannot be guaranteed", async () => {
  gitProtectionSucceeds = false;
  await expect(syncProjectEnvironment(input)).rejects.toThrow(
    "excluded from Git",
  );
  expect(writes).toHaveLength(0);
});
