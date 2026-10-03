CREATE TABLE "codex_run_leases" (
	"user_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codex_run_leases" ADD CONSTRAINT "codex_run_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;