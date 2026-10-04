import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  stackConfigurationSchema,
  type StackSummary,
  type StackConfiguration,
} from "@/lib/stacks/schema";
import { db } from "./client";
import { agentStacks, agentStackVersions } from "./schema";

function summarize(
  stack: typeof agentStacks.$inferSelect,
  row: typeof agentStackVersions.$inferSelect,
): StackSummary {
  const {
    id,
    stackId: _stackId,
    version,
    createdAt: _createdAt,
    ...configuration
  } = row;
  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    versionId: id,
    version,
    configuration: stackConfigurationSchema.parse(configuration),
  };
}

export async function listStacks(userId: string): Promise<StackSummary[]> {
  const rows = await db
    .select({ stack: agentStacks, version: agentStackVersions })
    .from(agentStacks)
    .innerJoin(
      agentStackVersions,
      and(
        eq(agentStackVersions.stackId, agentStacks.id),
        eq(agentStackVersions.version, agentStacks.currentVersion),
      ),
    )
    .where(eq(agentStacks.userId, userId))
    .orderBy(desc(agentStacks.updatedAt));
  return rows.map(({ stack, version }) => summarize(stack, version));
}

export async function getOwnedStackVersion(
  userId: string,
  versionId: string,
): Promise<StackSummary | undefined> {
  const [row] = await db
    .select({ stack: agentStacks, version: agentStackVersions })
    .from(agentStackVersions)
    .innerJoin(agentStacks, eq(agentStacks.id, agentStackVersions.stackId))
    .where(
      and(eq(agentStacks.userId, userId), eq(agentStackVersions.id, versionId)),
    )
    .limit(1);
  return row ? summarize(row.stack, row.version) : undefined;
}

interface StackInput {
  name: string;
  description: string;
  configuration: StackConfiguration;
}

export async function createStack(userId: string, input: StackInput) {
  const configuration = stackConfigurationSchema.parse(input.configuration);
  return db.transaction(async (tx) => {
    const [stack] = await tx
      .insert(agentStacks)
      .values({
        id: nanoid(),
        userId,
        name: input.name,
        description: input.description,
      })
      .returning();
    if (!stack) throw new Error("Failed to create Stack");
    const [version] = await tx
      .insert(agentStackVersions)
      .values({ id: nanoid(), stackId: stack.id, version: 1, ...configuration })
      .returning();
    if (!version) throw new Error("Failed to create Stack version");
    return summarize(stack, version);
  });
}

/** CAS serializes concurrent edits; inserting the new version is atomic with it. */
export async function publishStackVersion(
  userId: string,
  stackId: string,
  expectedVersion: number,
  input: StackInput,
) {
  const configuration = stackConfigurationSchema.parse(input.configuration);
  return db.transaction(async (tx) => {
    const [stack] = await tx
      .update(agentStacks)
      .set({
        name: input.name,
        description: input.description,
        currentVersion: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentStacks.id, stackId),
          eq(agentStacks.userId, userId),
          eq(agentStacks.currentVersion, expectedVersion),
        ),
      )
      .returning();
    if (!stack) return undefined;
    const [version] = await tx
      .insert(agentStackVersions)
      .values({
        id: nanoid(),
        stackId,
        version: stack.currentVersion,
        ...configuration,
      })
      .returning();
    if (!version) throw new Error("Failed to publish Stack version");
    return summarize(stack, version);
  });
}
