import { register } from "node:module";
import { createHash } from "node:crypto";

register("./actions-probe-loader.ts", import.meta.url);

async function main() {
  if (process.env.LAUNCHSTACK_ACTION_READ_PROBE !== "1") {
    console.log(
      "NOT_CONFIGURED: Explicit opt-in requires LAUNCHSTACK_ACTION_READ_PROBE=1.",
    );
    return;
  }
  const key = process.env.COMPOSIO_API_KEY;
  const userId = process.env.LAUNCHSTACK_PROBE_USER_ID;
  if (!key || !userId) {
    console.log(
      "NOT_CONFIGURED: COMPOSIO_API_KEY and an existing LaunchStack User ID are required.",
    );
    return;
  }
  const { createComposioActionProvider } =
    await import("../lib/actions/composio.ts");
  const { runLiveReadProbe } =
    await import("../lib/actions/live-read-probe.ts");
  const provider = createComposioActionProvider(key);
  for (const toolkit of ["gmail", "linear"] as const) {
    const prefix = `LAUNCHSTACK_PROBE_${toolkit.toUpperCase()}`;
    const accountId = process.env[`${prefix}_ACCOUNT_ID`];
    if (!accountId) {
      console.log(
        `${toolkit}: NOT_CONFIGURED: Select an existing account ID explicitly.`,
      );
      continue;
    }
    try {
      const evidence = await runLiveReadProbe({
        provider,
        userId,
        toolkit,
        accountId,
        query:
          process.env[`${prefix}_QUERY`] ??
          (toolkit === "gmail" ? "newer_than:1d" : "launchstack"),
        detailId: process.env[`${prefix}_DETAIL_ID`],
      });
      console.log(
        JSON.stringify({
          ...evidence,
          accountFingerprint: createHash("sha256")
            .update(accountId)
            .digest("hex")
            .slice(0, 12),
        }),
      );
    } catch {
      console.log(
        `${toolkit}: PROVIDER_UNAVAILABLE: Authorization, schema, execution, or cleanup was not confirmed. No private provider response was printed.`,
      );
      process.exitCode = 1;
    }
  }
}
const deadline = setTimeout(() => {
  console.log("PROVIDER_UNAVAILABLE: Probe exceeded its 150-second deadline.");
  process.exit(1);
}, 150_000);
try {
  await main();
} finally {
  clearTimeout(deadline);
}
