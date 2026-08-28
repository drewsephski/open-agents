CREATE TABLE "billing_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
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
	"stripe_customer_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"status" text NOT NULL,
	"financial_state" text DEFAULT 'paid' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"latest_event_created_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook_receipts" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_created_at" timestamp NOT NULL,
	"processing_state" text DEFAULT 'processing' NOT NULL,
	"processing_error_code" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
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
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_entitlements" ADD CONSTRAINT "billing_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_entitlements" ADD CONSTRAINT "billing_entitlements_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD CONSTRAINT "managed_inference_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD CONSTRAINT "managed_inference_keys_entitlement_id_billing_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."billing_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_usage_periods" ADD CONSTRAINT "sandbox_usage_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_id_idx" ON "billing_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_stripe_customer_id_idx" ON "billing_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_entitlements_user_kind_idx" ON "billing_entitlements" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "billing_entitlements_subscription_id_idx" ON "billing_entitlements" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_user_id_idx" ON "billing_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_id_idx" ON "billing_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "billing_webhook_receipts_event_created_at_idx" ON "billing_webhook_receipts" USING btree ("event_created_at");--> statement-breakpoint
CREATE INDEX "managed_inference_keys_user_id_idx" ON "managed_inference_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "managed_inference_keys_entitlement_id_idx" ON "managed_inference_keys" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_inference_keys_provider_key_id_idx" ON "managed_inference_keys" USING btree ("provider_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_inference_keys_key_hash_idx" ON "managed_inference_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_user_provider_idx" ON "provider_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "sandbox_usage_periods_user_tier_start_idx" ON "sandbox_usage_periods" USING btree ("user_id","tier","period_start");--> statement-breakpoint
CREATE INDEX "sandbox_usage_periods_period_end_idx" ON "sandbox_usage_periods" USING btree ("period_end");