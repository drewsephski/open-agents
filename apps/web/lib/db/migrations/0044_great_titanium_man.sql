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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sandbox_metering_leases" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"usage_period_id" text NOT NULL,
	"state" text DEFAULT 'starting' NOT NULL,
	"started_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inference_call_reservations" ADD CONSTRAINT "inference_call_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD CONSTRAINT "sandbox_metering_leases_usage_period_id_sandbox_usage_periods_id_fk" FOREIGN KEY ("usage_period_id") REFERENCES "public"."sandbox_usage_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inference_call_reservations_user_period_idx" ON "inference_call_reservations" USING btree ("user_id","period_start","period_end","state");--> statement-breakpoint
CREATE INDEX "sandbox_metering_leases_user_period_idx" ON "sandbox_metering_leases" USING btree ("user_id","usage_period_id","state");