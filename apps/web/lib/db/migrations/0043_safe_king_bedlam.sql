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
ALTER TABLE "billing_checkout_reservations" ADD COLUMN "request_payload" jsonb;--> statement-breakpoint
ALTER TABLE "managed_key_cleanup_jobs" ADD CONSTRAINT "managed_key_cleanup_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managed_key_cleanup_jobs" ADD CONSTRAINT "managed_key_cleanup_jobs_managed_key_id_managed_inference_keys_id_fk" FOREIGN KEY ("managed_key_id") REFERENCES "public"."managed_inference_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "managed_key_cleanup_jobs_user_state_idx" ON "managed_key_cleanup_jobs" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "managed_key_cleanup_jobs_managed_key_id_idx" ON "managed_key_cleanup_jobs" USING btree ("managed_key_id");