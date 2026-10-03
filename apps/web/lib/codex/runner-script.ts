// Executed inside the user's isolated VM. No credential is embedded in this source.
export const CODEX_RUNNER_SCRIPT = String.raw`
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");
const dir = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(dir, "input.json"), "utf8"));
if (fs.existsSync(dir + ".stopped")) { fs.rmSync(config.authDirectory, { recursive: true, force: true }); process.exit(0); }
const env = { ...process.env, CODEX_HOME: config.authDirectory };
for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL"]) delete env[key];
const child = spawn(path.join(dir, "cli/node_modules/.bin/codex"), [
  "exec", "--json", "--ephemeral", "--skip-git-repo-check",
  "--sandbox", "danger-full-access", "-c", "approval_policy=\"never\"",
  "-c", "forced_login_method=\"chatgpt\"", "-c", "cli_auth_credentials_store=\"file\"",
  "-c", "model_provider=\"openai\"", "-c", "chatgpt_base_url=\"https://chatgpt.com/backend-api\"",
  "-c", "sandbox_workspace_write.network_access=true", "-",
], { cwd: config.cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
fs.writeFileSync(path.join(dir, "pid"), String(child.pid), { mode: 0o600 });
child.stdout.setEncoding("utf8");
const initialTokens = JSON.parse(fs.readFileSync(path.join(config.authDirectory, "auth.json"), "utf8")).tokens;
let output = "";
let truncated = false;
child.stdout.on("data", data => {
  if (output.length + data.length > 4000000) { truncated = true; return; }
  output += data.toString();
});
// Never persist stderr: login failures can contain sensitive diagnostics.
child.stderr.resume();
child.stdin.on("error", () => {});
child.stdin.end(config.prompt);
const stop = () => {
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
  fs.rmSync(config.authDirectory, { recursive: true, force: true });
};
const watchdog = setInterval(() => {
  let heartbeat = 0;
  try { heartbeat = fs.statSync(path.join(dir, "heartbeat")).mtimeMs; } catch {}
  if (Date.now() - heartbeat > 90000 || fs.existsSync(dir + ".stopped")) stop();
}, 5000);
const deadline = setTimeout(stop, 480000);
child.on("error", () => {
  clearInterval(watchdog); clearTimeout(deadline);
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ exitCode: 1, output: "", truncated }));
});
child.on("close", code => {
  const secrets = [...Object.values(initialTokens)];
  try { secrets.push(...Object.values(JSON.parse(fs.readFileSync(path.join(config.authDirectory, "auth.json"), "utf8")).tokens)); } catch {}
  for (const secret of secrets) if (typeof secret === "string" && secret) output = output.split(secret).join("[redacted]");
  clearInterval(watchdog); clearTimeout(deadline);
  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify({ exitCode: code, output, truncated }), { mode: 0o600 });
});
`;
