import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CODEX_RUNNER_SCRIPT } from "./runner-script";

test("runner forces subscription auth, clears API credentials, and redacts login secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-runner-test-"));
  try {
    await mkdir(join(dir, "cli/node_modules/.bin"), { recursive: true });
    await mkdir(join(dir, "auth"));
    await writeFile(join(dir, "runner.cjs"), CODEX_RUNNER_SCRIPT);
    await writeFile(
      join(dir, "input.json"),
      JSON.stringify({
        cwd: dir,
        authDirectory: join(dir, "auth"),
        prompt: "Check workspace",
      }),
    );
    await writeFile(join(dir, "heartbeat"), "");
    await writeFile(
      join(dir, "auth/auth.json"),
      JSON.stringify({ tokens: { access_token: "fixture-login-secret" } }),
    );
    const cli = join(dir, "cli/node_modules/.bin/codex");
    await writeFile(
      cli,
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync("invocation.json", JSON.stringify({ args: process.argv.slice(2), apiKey: process.env.OPENAI_API_KEY, codexKey: process.env.CODEX_API_KEY, accessToken: process.env.CODEX_ACCESS_TOKEN, baseUrl: process.env.OPENAI_BASE_URL, home: process.env.CODEX_HOME }));
process.stdin.resume();
process.stdin.on("end", () => { console.log("fixture-login-secret"); console.error("private stderr"); });
`,
    );
    await chmod(cli, 0o700);
    await promisify(execFile)(process.execPath, [join(dir, "runner.cjs")], {
      env: {
        ...process.env,
        OPENAI_API_KEY: "fixture-api",
        CODEX_API_KEY: "fixture-key",
        CODEX_ACCESS_TOKEN: "fixture-token",
        OPENAI_BASE_URL: "https://invalid.example",
      },
      timeout: 10000,
    });
    const invocation = JSON.parse(
      await readFile(join(dir, "invocation.json"), "utf8"),
    );
    expect(invocation.args).toContain('forced_login_method="chatgpt"');
    expect(invocation.args).toContain('cli_auth_credentials_store="file"');
    expect(invocation.args).toContain('approval_policy="never"');
    expect(invocation.args).toContain("danger-full-access");
    expect(invocation.args).toContain('model_provider="openai"');
    expect(invocation.args).toContain(
      'chatgpt_base_url="https://chatgpt.com/backend-api"',
    );
    expect(invocation.apiKey).toBeUndefined();
    expect(invocation.codexKey).toBeUndefined();
    expect(invocation.accessToken).toBeUndefined();
    expect(invocation.baseUrl).toBeUndefined();
    expect(invocation.home.endsWith(join(dir.split("/").at(-1)!, "auth"))).toBe(
      true,
    );
    const result = JSON.parse(await readFile(join(dir, "result.json"), "utf8"));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[redacted]");
    expect(result.output).not.toContain("fixture-login-secret");
    expect(result.output).not.toContain("private stderr");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
