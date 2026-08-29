CREATE TABLE "billing_checkout_reservations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'failed' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"claim_token" text,
	"lease_expires_at" timestamp,
	"stripe_session_id" text,
	"session_url" text,
	"session_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ALTER COLUMN "financial_state" SET DEFAULT 'unpaid';--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "latest_financial_event_id" text;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "paid_period_start" timestamp;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD COLUMN "paid_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "billing_webhook_receipts" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "billing_webhook_receipts" ADD COLUMN "claim_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_webhook_receipts" ADD COLUMN "lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD COLUMN "claim_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "managed_inference_keys" ADD COLUMN "lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "billing_checkout_reservations" ADD CONSTRAINT "billing_checkout_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_reservations_session_id_idx" ON "billing_checkout_reservations" USING btree ("stripe_session_id");