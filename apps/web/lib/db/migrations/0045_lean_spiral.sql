CREATE TABLE "agent_stack_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"stack_id" text NOT NULL,
	"version" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"execution_backend" text NOT NULL,
	"model" jsonb,
	"subagent_model" jsonb,
	"sandbox_type" text NOT NULL,
	"mission_type" text NOT NULL,
	"instructions" text NOT NULL,
	"global_skill_refs" jsonb NOT NULL,
	"auto_commit_push" boolean NOT NULL,
	"auto_create_pr" boolean NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_stacks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stack_version_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stack_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "agent_stack_versions" ADD CONSTRAINT "agent_stack_versions_stack_id_agent_stacks_id_fk" FOREIGN KEY ("stack_id") REFERENCES "public"."agent_stacks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_stacks" ADD CONSTRAINT "agent_stacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_stack_versions_stack_version_idx" ON "agent_stack_versions" USING btree ("stack_id","version");--> statement-breakpoint
CREATE INDEX "agent_stacks_user_idx" ON "agent_stacks" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_stack_version_id_agent_stack_versions_id_fk" FOREIGN KEY ("stack_version_id") REFERENCES "public"."agent_stack_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_stack_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stack versions are immutable; publish a new version';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER agent_stack_versions_immutable BEFORE UPDATE ON agent_stack_versions
FOR EACH ROW EXECUTE FUNCTION prevent_stack_version_update();
--> statement-breakpoint
CREATE FUNCTION prevent_session_stack_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stack_snapshot IS DISTINCT FROM OLD.stack_snapshot
     OR NEW.stack_version_id IS DISTINCT FROM OLD.stack_version_id THEN
    RAISE EXCEPTION 'Session Stack snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sessions_stack_immutable BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION prevent_session_stack_update();
