import type { InferenceAccountingSettlement } from "@open-agents/agent";
import type { SandboxState } from "@open-agents/sandbox";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import type { ModelVariant } from "@/lib/model-variants";
import type { GlobalSkillRef } from "@/lib/skills/global-skill-refs";
import {
  DEFAULT_CHAT_MISSION_TYPE,
  MISSION_TYPE_VALUES,
  type MissionType,
} from "@/lib/missions";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// users
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

// Server-side external-action session references (never OAuth credentials).
export const actionProviderSessions = pgTable(
  "action_provider_sessions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    sessionId: text("session_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.providerId] })],
);

// oauth provider accounts
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["openrouter"] }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    authenticationTag: text("authentication_tag").notNull(),
    encryptionKeyVersion: integer("encryption_key_version").notNull(),
    label: text("label").notNull(),
    lastFour: text("last_four").notNull(),
    validationState: text("validation_state", {
      enum: ["pending", "valid", "invalid", "revoked"],
    })
      .notNull()
      .default("pending"),
    validatedAt: timestamp("validated_at"),
    validationErrorCode: text("validation_error_code"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("provider_credentials_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  ],
);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerCustomerId: text("provider_customer_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_customers_user_id_idx").on(table.userId),
    uniqueIndex("billing_customers_provider_customer_id_idx").on(
      table.providerCustomerId,
    ),
  ],
);

export const billingCheckoutReservations = pgTable(
  "billing_checkout_reservations",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["creating", "open", "failed"] })
      .notNull()
      .default("failed"),
    generation: integer("generation").notNull().default(0),
    claimToken: text("claim_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    providerSessionId: text("provider_session_id"),
    sessionUrl: text("session_url"),
    sessionExpiresAt: timestamp("session_expires_at"),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_checkout_reservations_session_id_idx").on(
      table.providerSessionId,
    ),
  ],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerProductId: text("provider_product_id").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    status: text("status", {
      enum: [
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ],
    }).notNull(),
    financialState: text("financial_state", {
      enum: [
        "unpaid",
        "paid",
        "partially_refunded",
        "fully_refunded",
        "disputed",
      ],
    })
      .notNull()
      .default("unpaid"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    canceledAt: timestamp("canceled_at"),
    latestEventCreatedAt: timestamp("latest_event_created_at").notNull(),
    latestFinancialEventCreatedAt: timestamp(
      "latest_financial_event_created_at",
    ),
    latestFinancialEventId: text("latest_financial_event_id"),
    paidPeriodStart: timestamp("paid_period_start"),
    paidPeriodEnd: timestamp("paid_period_end"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("billing_subscriptions_user_id_idx").on(table.userId),
    index("billing_subscriptions_customer_id_idx").on(table.providerCustomerId),
  ],
);

export const billingEntitlements = pgTable(
  "billing_entitlements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => billingSubscriptions.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["managed_openrouter"] }).notNull(),
    state: text("state", { enum: ["active", "inactive"] }).notNull(),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    latestEventCreatedAt: timestamp("latest_event_created_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_entitlements_user_kind_idx").on(
      table.userId,
      table.kind,
    ),
    index("billing_entitlements_subscription_id_idx").on(table.subscriptionId),
  ],
);

export const billingWebhookReceipts = pgTable(
  "billing_webhook_receipts",
  {
    providerEventId: text("provider_event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    eventCreatedAt: timestamp("event_created_at").notNull(),
    processingState: text("processing_state", {
      enum: ["processing", "processed", "failed"],
    })
      .notNull()
      .default("processing"),
    processingErrorCode: text("processing_error_code"),
    claimToken: text("claim_token"),
    claimGeneration: integer("claim_generation").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [
    index("billing_webhook_receipts_event_created_at_idx").on(
      table.eventCreatedAt,
    ),
  ],
);

export const managedInferenceKeys = pgTable(
  "managed_inference_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entitlementId: text("entitlement_id").references(
      () => billingEntitlements.id,
      { onDelete: "set null" },
    ),
    provider: text("provider", { enum: ["openrouter"] })
      .notNull()
      .default("openrouter"),
    providerKeyId: text("provider_key_id"),
    ciphertext: text("ciphertext"),
    nonce: text("nonce"),
    authenticationTag: text("authentication_tag"),
    encryptionKeyVersion: integer("encryption_key_version"),
    keyHash: text("key_hash"),
    label: text("label").notNull(),
    lifecycleState: text("lifecycle_state", {
      enum: ["provisioning", "active", "failed", "revoking", "revoked"],
    })
      .notNull()
      .default("provisioning"),
    claimToken: text("claim_token"),
    claimGeneration: integer("claim_generation").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at"),
    spendLimitMicros: integer("spend_limit_micros")
      .notNull()
      .default(10_000_000),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    provisioningErrorCode: text("provisioning_error_code"),
    provisionedAt: timestamp("provisioned_at"),
    rotatedAt: timestamp("rotated_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("managed_inference_keys_user_id_idx").on(table.userId),
    index("managed_inference_keys_entitlement_id_idx").on(table.entitlementId),
    uniqueIndex("managed_inference_keys_provider_key_id_idx").on(
      table.providerKeyId,
    ),
    uniqueIndex("managed_inference_keys_key_hash_idx").on(table.keyHash),
  ],
);

export const managedKeyCleanupJobs = pgTable(
  "managed_key_cleanup_jobs",
  {
    providerKeyId: text("provider_key_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    managedKeyId: text("managed_key_id").references(
      () => managedInferenceKeys.id,
      { onDelete: "set null" },
    ),
    label: text("label").notNull(),
    state: text("state", {
      enum: ["pending", "processing", "attached", "done"],
    })
      .notNull()
      .default("pending"),
    availableAt: timestamp("available_at").notNull(),
    claimToken: text("claim_token"),
    claimGeneration: integer("claim_generation").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("managed_key_cleanup_jobs_user_state_idx").on(
      table.userId,
      table.state,
    ),
    index("managed_key_cleanup_jobs_managed_key_id_idx").on(table.managedKeyId),
  ],
);

// better-auth sessions
export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

// better-auth verification tokens
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const githubInstallations = pgTable(
  "github_installations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installationId: integer("installation_id").notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type", {
      enum: ["User", "Organization"],
    }).notNull(),
    repositorySelection: text("repository_selection", {
      enum: ["all", "selected"],
    }).notNull(),
    installationUrl: text("installation_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("github_installations_user_installation_idx").on(
      table.userId,
      table.installationId,
    ),
    uniqueIndex("github_installations_user_account_idx").on(
      table.userId,
      table.accountLogin,
    ),
  ],
);

export const vercelProjectLinks = pgTable(
  "vercel_project_links",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    projectId: text("project_id").notNull(),
    projectName: text("project_name").notNull(),
    teamId: text("team_id"),
    teamSlug: text("team_slug"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.repoOwner, table.repoName],
    }),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed", "archived"],
    })
      .notNull()
      .default("running"),
    missionType: text("mission_type", { enum: MISSION_TYPE_VALUES })
      .$type<MissionType>()
      .notNull()
      .default(DEFAULT_CHAT_MISSION_TYPE),
    // Repository info
    repoOwner: text("repo_owner"),
    repoName: text("repo_name"),
    branch: text("branch"),
    cloneUrl: text("clone_url"),
    vercelProjectId: text("vercel_project_id"),
    vercelProjectName: text("vercel_project_name"),
    vercelTeamId: text("vercel_team_id"),
    vercelTeamSlug: text("vercel_team_slug"),
    // Whether this session uses a new auto-generated branch
    isNewBranch: boolean("is_new_branch").default(false).notNull(),
    // Optional per-session override for auto commit + push behavior.
    // null means "use the user's default preference".
    autoCommitPushOverride: boolean("auto_commit_push_override"),
    // Optional per-session override for auto PR creation after auto-commit.
    // null means "use the user's default preference".
    autoCreatePrOverride: boolean("auto_create_pr_override"),
    globalSkillRefs: jsonb("global_skill_refs")
      .$type<GlobalSkillRef[]>()
      .notNull()
      .default([]),
    // Unified sandbox state
    sandboxState: jsonb("sandbox_state").$type<SandboxState>(),
    // Lifecycle orchestration state for sandbox management
    lifecycleState: text("lifecycle_state", {
      enum: [
        "provisioning",
        "active",
        "hibernating",
        "hibernated",
        "restoring",
        "archived",
        "failed",
      ],
    }),
    lifecycleVersion: integer("lifecycle_version").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at"),
    sandboxExpiresAt: timestamp("sandbox_expires_at"),
    hibernateAfter: timestamp("hibernate_after"),
    lifecycleRunId: text("lifecycle_run_id"),
    sandboxProvisioningRunId: text("sandbox_provisioning_run_id"),
    lifecycleError: text("lifecycle_error"),
    // Git stats (for display in session list)
    linesAdded: integer("lines_added").default(0),
    linesRemoved: integer("lines_removed").default(0),
    // PR info if created
    prNumber: integer("pr_number"),
    prStatus: text("pr_status", {
      enum: ["open", "merged", "closed"],
    }),
    // Snapshot info (for cached snapshots feature)
    snapshotUrl: text("snapshot_url"),
    snapshotCreatedAt: timestamp("snapshot_created_at"),
    snapshotSizeBytes: integer("snapshot_size_bytes"),
    // Cached diff for offline viewing
    cachedDiff: jsonb("cached_diff"),
    cachedDiffUpdatedAt: timestamp("cached_diff_updated_at"),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/**
 * Cross-instance sandbox provider circuit state. Provider is text (rather than
 * a Postgres enum) so a future real adapter can be added without an enum
 * migration. This table never stores provider credentials or sandbox IDs.
 */
export const sandboxProviderCircuits = pgTable(
  "sandbox_provider_circuits",
  {
    provider: text("provider").primaryKey(),
    failureCount: integer("failure_count").notNull().default(0),
    failureWindowStartedAt: timestamp("failure_window_started_at"),
    openedAt: timestamp("opened_at"),
    openUntil: timestamp("open_until"),
    probeLeaseUntil: timestamp("probe_lease_until"),
    lastFailureClass: text("last_failure_class"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("sandbox_provider_circuits_open_until_idx").on(table.openUntil),
  ],
);

export const sandboxUsagePeriods = pgTable(
  "sandbox_usage_periods",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: ["byok", "pro"] }).notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    allowanceMilliseconds: bigint("allowance_milliseconds", {
      mode: "number",
    }).notNull(),
    consumedMilliseconds: bigint("consumed_milliseconds", {
      mode: "number",
    })
      .notNull()
      .default(0),
    runningSandboxCount: integer("running_sandbox_count").notNull().default(0),
    lastMeteredAt: timestamp("last_metered_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sandbox_usage_periods_user_tier_start_idx").on(
      table.userId,
      table.tier,
      table.periodStart,
    ),
    index("sandbox_usage_periods_period_end_idx").on(table.periodEnd),
  ],
);

export const sandboxMeteringLeases = pgTable(
  "sandbox_metering_leases",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usagePeriodId: text("usage_period_id")
      .notNull()
      .references(() => sandboxUsagePeriods.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["starting", "running"] })
      .notNull()
      .default("starting"),
    startedAt: timestamp("started_at").notNull(),
    admissionExpiresAt: timestamp("admission_expires_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("sandbox_metering_leases_user_period_idx").on(
      table.userId,
      table.usagePeriodId,
      table.state,
    ),
  ],
);

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    modelId: text("model_id").default(APP_DEFAULT_MODEL_ID),
    executionBackend: text("execution_backend", {
      enum: ["launchstack_native", "codex", "opencode"],
    })
      .notNull()
      .default("launchstack_native"),
    activeStreamId: text("active_stream_id"),
    lastAssistantMessageAt: timestamp("last_assistant_message_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("chats_session_id_idx").on(table.sessionId)],
);

export const shares = pgTable(
  "shares",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("shares_chat_id_idx").on(table.chatId)],
);

export const actionExecutions = pgTable(
  "action_executions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").$type<unknown>().notNull(),
    status: text("status", { enum: ["started", "completed"] }).notNull(),
    output: jsonb("output").$type<unknown>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chatId, table.toolCallId] }),
  ],
);

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["user", "assistant"],
  }).notNull(),
  // Store the full message parts as JSON for flexibility
  parts: jsonb("parts").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatReads = pgTable(
  "chat_reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chatId] }),
    index("chat_reads_chat_id_idx").on(table.chatId),
  ],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: text("model_id"),
    status: text("status", {
      enum: ["completed", "aborted", "failed"],
    }).notNull(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
    totalDurationMs: integer("total_duration_ms").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_runs_chat_id_idx").on(table.chatId),
    index("workflow_runs_session_id_idx").on(table.sessionId),
    index("workflow_runs_user_id_idx").on(table.userId),
  ],
);

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    finishReason: text("finish_reason"),
    rawFinishReason: text("raw_finish_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_run_steps_run_id_idx").on(table.workflowRunId),
    uniqueIndex("workflow_run_steps_run_step_idx").on(
      table.workflowRunId,
      table.stepNumber,
    ),
  ],
);

export const modelCallToolCheckpoints = pgTable(
  "model_call_tool_checkpoints",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id").notNull(),
    stepNumber: integer("step_number").notNull(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    state: text("state", { enum: ["observed", "replayable"] })
      .notNull()
      .default("observed"),
    responseMessage: jsonb("response_message").notNull(),
    responseMessages: jsonb("response_messages").notNull(),
    accountingSettlement: jsonb(
      "accounting_settlement",
    ).$type<InferenceAccountingSettlement>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("model_call_tool_checkpoints_run_step_idx").on(
      table.workflowRunId,
      table.stepNumber,
    ),
    index("model_call_tool_checkpoints_chat_idx").on(table.chatId),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VercelProjectLink = typeof vercelProjectLinks.$inferSelect;
export type NewVercelProjectLink = typeof vercelProjectLinks.$inferInsert;
export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type ChatRead = typeof chatReads.$inferSelect;
export type NewChatRead = typeof chatReads.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowRunStep = typeof workflowRunSteps.$inferSelect;
export type NewWorkflowRunStep = typeof workflowRunSteps.$inferInsert;
export type GitHubInstallation = typeof githubInstallations.$inferSelect;
export type NewGitHubInstallation = typeof githubInstallations.$inferInsert;
export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type NewProviderCredential = typeof providerCredentials.$inferInsert;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type NewBillingCustomer = typeof billingCustomers.$inferInsert;
export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type NewBillingSubscription = typeof billingSubscriptions.$inferInsert;
export type BillingEntitlement = typeof billingEntitlements.$inferSelect;
export type NewBillingEntitlement = typeof billingEntitlements.$inferInsert;
export type BillingWebhookReceipt = typeof billingWebhookReceipts.$inferSelect;
export type NewBillingWebhookReceipt =
  typeof billingWebhookReceipts.$inferInsert;
export type ManagedInferenceKey = typeof managedInferenceKeys.$inferSelect;
export type NewManagedInferenceKey = typeof managedInferenceKeys.$inferInsert;
export type ManagedKeyCleanupJob = typeof managedKeyCleanupJobs.$inferSelect;
export type NewManagedKeyCleanupJob = typeof managedKeyCleanupJobs.$inferInsert;
export type SandboxUsagePeriod = typeof sandboxUsagePeriods.$inferSelect;
export type NewSandboxUsagePeriod = typeof sandboxUsagePeriods.$inferInsert;
export type SandboxMeteringLease = typeof sandboxMeteringLeases.$inferSelect;

// User preferences for settings
export const userPreferences = pgTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultModelId: text("default_model_id").default(APP_DEFAULT_MODEL_ID),
  defaultSubagentModelId: text("default_subagent_model_id"),
  defaultSandboxType: text("default_sandbox_type", {
    enum: ["vercel"],
  }).default("vercel"),
  defaultDiffMode: text("default_diff_mode", {
    enum: ["unified", "split"],
  }).default("unified"),
  autoCommitPush: boolean("auto_commit_push").notNull().default(false),
  autoCreatePr: boolean("auto_create_pr").notNull().default(false),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  alertSoundEnabled: boolean("alert_sound_enabled").notNull().default(true),
  publicUsageEnabled: boolean("public_usage_enabled").notNull().default(false),
  globalSkillRefs: jsonb("global_skill_refs")
    .$type<GlobalSkillRef[]>()
    .notNull()
    .default([]),
  modelVariants: jsonb("model_variants")
    .$type<ModelVariant[]>()
    .notNull()
    .default([]),
  enabledModelIds: jsonb("enabled_model_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;

// Usage tracking — one row per authenticated provider call (append-only)
export const usageEvents = pgTable("usage_events", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["web"] })
    .notNull()
    .default("web"),
  agentType: text("agent_type", { enum: ["main", "subagent"] })
    .notNull()
    .default("main"),
  provider: text("provider"),
  modelId: text("model_id"),
  credentialSource: text("credential_source", {
    enum: ["byok", "managed", "administrative"],
  }),
  inferenceCostUsd: numeric("inference_cost_usd", {
    precision: 18,
    scale: 12,
  }),
  accountingStatus: text("accounting_status", {
    enum: ["accounted", "failed"],
  })
    .notNull()
    .default("accounted"),
  accountingFailureReason: text("accounting_failure_reason", {
    enum: [
      "missing_cost",
      "provider_error",
      "stream_cancelled",
      "stream_truncated",
    ],
  }),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCallCount: integer("tool_call_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inferenceCallReservations = pgTable(
  "inference_call_reservations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    reservedMicros: bigint("reserved_micros", { mode: "number" }).notNull(),
    state: text("state", {
      enum: ["pending", "reconciled", "missing_cost", "abandoned"],
    })
      .notNull()
      .default("pending"),
    actualCostUsd: numeric("actual_cost_usd", {
      precision: 18,
      scale: 12,
    }),
    actualCostMicros: bigint("actual_cost_micros", { mode: "number" }),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("inference_call_reservations_user_period_idx").on(
      table.userId,
      table.periodStart,
      table.periodEnd,
      table.state,
    ),
  ],
);

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;
export type InferenceCallReservation =
  typeof inferenceCallReservations.$inferSelect;
