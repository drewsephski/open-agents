CREATE TABLE "billing_checkout_reservations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'failed' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"claim_token" text,
	"lease_expires_at" timestamp,
	"provider_session_id" text,
	"session_url" text,
	"session_expires_at" timestamp,
	"request_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"latest_event_created_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"provider_product_id" text NOT NULL,
	"provider_price_id" text NOT NULL,
	"status" text NOT NULL,
	"financial_state" text DEFAULT 'unpaid' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"latest_event_created_at" timestamp NOT NULL,
	"latest_financial_event_created_at" timestamp,
	"latest_financial_event_id" text,
	"paid_period_start" timestamp,
	"paid_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_receipts" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_created_at" timestamp NOT NULL,
	"processing_state" text DEFAULT 'processing' NOT NULL,
	"processing_error_code" text,
	"claim_token" text,
	"claim_generation" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "inference_call_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"actual_cost_usd" numeric(18, 12),
	"actual_cost_micros" bigint,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "managed_inference_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entitlement_id" text,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"provider_key_id" text,
	"ciphertext" text,
	"nonce" text,
	"authentication_tag" text,
	"encryption_key_version" integer,
	"key_hash" text,
	"label" text NOT NULL,
	"lifecycle_state" text DEFAULT 'provisioning' NOT NULL,
	"claim_token" text,
	"claim_generation" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"spend_limit_micros" integer DEFAULT 10000000 NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"provisioning_error_code" text,
	"provisioned_at" timestamp,
	"rotated_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managed_key_cleanup_jobs" (
	"provider_key_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"managed_key_id" text,
	"label" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp NOT NULL,
	"claim_token" text,
	"claim_generation" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp,
	"last_error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_call_tool_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"state" text DEFAULT 'observed' NOT NULL,
	"response_message" jsonb NOT NULL,
	"response_messages" jsonb NOT NULL,
	"accounting_settlement" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"authentication_tag" text NOT NULL,
	"encryption_key_version" integer NOT NULL,
	"label" text NOT NULL,
	"last_four" text NOT NULL,
	"validation_state" text DEFAULT 'pending' NOT NULL,
	"validated_at" timestamp,
	"validation_error_code" text,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_metering_leases" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"usage_period_id" text NOT NULL,
	"state" text DEFAULT 'starting' NOT NULL,
	"started_at" timestamp NOT NULL,
	"admission_expires_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_usage_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"allowance_milliseconds" bigint NOT NULL,
	"consumed_milliseconds" bigint DEFAULT 0 NOT NULL,
	"running_sandbox_count" integer DEFAULT 0 NOT NULL,
	"last_metered_at" timestamp,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "execution_backend" text DEFAULT 'launchstack_native' NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "credential_source" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "inference_cost_usd" numeric(18, 12);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "accounting_status" text DEFAULT 'accounted' NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "accounting_failure_reason" text;--> statement-breakpoint
ALTER TABLE "billing_checkout_reservations" ADD CONSTRAINT "billing_checkout_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_entitlements" ADD CONSTRAINT "billing_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_entitlements" ADD CONSTRAINT "billing_entitlements_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_call_reservations" ADD CONSTRAINT "inference_call_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD CONSTRAINT "managed_inference_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD CONSTRAINT "managed_inference_keys_entitlement_id_billing_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."billing_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_key_cleanup_jobs" ADD CONSTRAINT "managed_key_cleanup_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_key_cleanup_jobs" ADD CONSTRAINT "managed_key_cleanup_jobs_managed_key_id_managed_inference_keys_id_fk" FOREIGN KEY ("managed_key_id") REFERENCES "public"."managed_inference_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_call_tool_checkpoints" ADD CONSTRAINT "model_call_tool_checkpoints_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_usage_period_id_sandbox_usage_periods_id_fk" FOREIGN KEY ("usage_period_id") REFERENCES "public"."sandbox_usage_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_usage_periods" ADD CONSTRAINT "sandbox_usage_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_reservations_session_id_idx" ON "billing_checkout_reservations" USING btree ("provider_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_id_idx" ON "billing_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_provider_customer_id_idx" ON "billing_customers" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_entitlements_user_kind_idx" ON "billing_entitlements" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "billing_entitlements_subscription_id_idx" ON "billing_entitlements" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_user_id_idx" ON "billing_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_id_idx" ON "billing_subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE INDEX "billing_webhook_receipts_event_created_at_idx" ON "billing_webhook_receipts" USING btree ("event_created_at");--> statement-breakpoint
CREATE INDEX "inference_call_reservations_user_period_idx" ON "inference_call_reservations" USING btree ("user_id","period_start","period_end","state");--> statement-breakpoint
CREATE INDEX "managed_inference_keys_user_id_idx" ON "managed_inference_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "managed_inference_keys_entitlement_id_idx" ON "managed_inference_keys" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_inference_keys_provider_key_id_idx" ON "managed_inference_keys" USING btree ("provider_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_inference_keys_key_hash_idx" ON "managed_inference_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "managed_key_cleanup_jobs_user_state_idx" ON "managed_key_cleanup_jobs" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "managed_key_cleanup_jobs_managed_key_id_idx" ON "managed_key_cleanup_jobs" USING btree ("managed_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_call_tool_checkpoints_run_step_idx" ON "model_call_tool_checkpoints" USING btree ("workflow_run_id","step_number");--> statement-breakpoint
CREATE INDEX "model_call_tool_checkpoints_chat_idx" ON "model_call_tool_checkpoints" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_user_provider_idx" ON "provider_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "sandbox_metering_leases_user_period_idx" ON "sandbox_metering_leases" USING btree ("user_id","usage_period_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_usage_periods_user_tier_start_idx" ON "sandbox_usage_periods" USING btree ("user_id","tier","period_start");--> statement-breakpoint
CREATE INDEX "sandbox_usage_periods_period_end_idx" ON "sandbox_usage_periods" USING btree ("period_end");