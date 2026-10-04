import { z } from "zod";
import { getServerSession } from "@/lib/session/get-server-session";
import { getOwnedStackVersion } from "@/lib/db/stacks";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { sanitizeUserPreferencesForSession } from "@/lib/model-access";
import { getNewChatBackend } from "@/lib/access/chat-backend";
import { buildDefaultStack } from "@/lib/stacks/default-stack";
import { freezeStackLaunch } from "@/lib/stacks/launch";
import { getLaunchReadiness } from "@/lib/stacks/launch-readiness";
import { actionAccountIdsSchema } from "@/lib/actions/bindings";
import {
  isValidGitHubRepoName,
  isValidGitHubRepoOwner,
} from "@/lib/github/urls";

const requestSchema = z.strictObject({
  stackVersionId: z.string().min(1).optional(),
  actionAccountIds: actionAccountIdsSchema.optional(),
  autoCommitPush: z.boolean().optional(),
  autoCreatePr: z.boolean().optional(),
  repository: z
    .strictObject({
      owner: z.string().refine(isValidGitHubRepoOwner),
      repo: z.string().refine(isValidGitHubRepoName),
    })
    .optional(),
});

export async function POST(request: Request) {
  const auth = await getServerSession();
  if (!auth?.user)
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Invalid readiness request" },
      { status: 400 },
    );
  }
  try {
    const stack = input.stackVersionId
      ? await getOwnedStackVersion(auth.user.id, input.stackVersionId)
      : undefined;
    if (input.stackVersionId && !stack)
      return Response.json(
        { error: "Stack version not found" },
        { status: 404 },
      );
    const configuration =
      stack?.configuration ??
      buildDefaultStack(
        sanitizeUserPreferencesForSession(
          await getUserPreferences(auth.user.id),
          auth,
          request.url,
        ),
        await getNewChatBackend(auth.user.id),
      );
    const readiness = await getLaunchReadiness({
      userId: auth.user.id,
      configuration: freezeStackLaunch({
        name: stack?.name ?? "LaunchStack default",
        version: stack?.version ?? 1,
        configuration,
        hasRepository: Boolean(input.repository),
        autoCommitPush: input.autoCommitPush,
        autoCreatePr: input.autoCreatePr,
      }).configuration,
      accountIds: input.actionAccountIds,
      repository: input.repository,
    });
    return Response.json(readiness, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Unable to verify launch readiness. Try again." },
      { status: 503 },
    );
  }
}
