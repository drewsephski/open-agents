CREATE TABLE "sandbox_provider_circuits" (
	"provider" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failure_window_started_at" timestamp,
	"opened_at" timestamp,
	"open_until" timestamp,
	"probe_lease_until" timestamp,
	"last_failure_class" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sandbox_provider_circuits_open_until_idx" ON "sandbox_provider_circuits" USING btree ("open_until");