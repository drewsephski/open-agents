import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { parseCodexAuthFile } from "../lib/codex/auth-file.ts";
import {
  encryptCredential,
  loadCredentialKeyring,
} from "../lib/credentials/envelope-encryption.ts";

// Explicit local operator action, never a public endpoint that imports host credentials.
const userId = process.argv[2];
if (!userId || process.env.NODE_ENV === "production") {
  console.error(
    "Usage in development: pnpm codex:connect-local <account-user-id>",
  );
  process.exit(1);
}
if (!process.env.POSTGRES_URL) {
  console.error("Configure the local database before connecting Codex.");
  process.exit(1);
}
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
try {
  const [user] = await sql`SELECT id FROM users WHERE id = ${userId}`;
  if (!user) throw new Error("Account not found");
  const authFile = parseCodexAuthFile(
    await readFile(
      join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"),
      "utf8",
    ),
  );
  const envelope = encryptCredential(authFile, {
    userId,
    provider: "codex",
    keyring: loadCredentialKeyring(),
  });
  const saved = await sql`
    INSERT INTO provider_credentials
      (id, user_id, provider, ciphertext, nonce, authentication_tag,
       encryption_key_version, label, last_four, validation_state, validated_at)
    VALUES (${crypto.randomUUID()}, ${userId}, 'codex', ${envelope.ciphertext},
      ${envelope.nonce}, ${envelope.authenticationTag}, ${envelope.encryptionKeyVersion},
      'Codex subscription', '', 'valid', NOW())
    ON CONFLICT (user_id, provider) DO NOTHING
    RETURNING id
  `;
  console.log(
    saved.length
      ? "Local Codex login connected securely."
      : "Codex is already connected; existing login preserved.",
  );
} catch {
  // Never print database or authentication diagnostics containing secrets.
  console.error(
    "Could not connect the local login. Check the account ID, database, encryption key, and ChatGPT auth.json login.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
