CREATE TABLE "model_call_tool_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"state" text DEFAULT 'observed' NOT NULL,
	"response_message" jsonb NOT NULL,
	"response_messages" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inference_call_reservations" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
UPDATE "inference_call_reservations" SET "expires_at" = "created_at" + interval '1 hour' WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "inference_call_reservations" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_metering_leases" ADD COLUMN "admission_expires_at" timestamp;--> statement-breakpoint
UPDATE "sandbox_metering_leases" SET "admission_expires_at" = "updated_at" + interval '15 minutes' WHERE "state" = 'starting';--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "accounting_status" text DEFAULT 'accounted' NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "accounting_failure_reason" text;--> statement-breakpoint
ALTER TABLE "model_call_tool_checkpoints" ADD CONSTRAINT "model_call_tool_checkpoints_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_call_tool_checkpoints_run_step_idx" ON "model_call_tool_checkpoints" USING btree ("workflow_run_id","step_number");--> statement-breakpoint
CREATE INDEX "model_call_tool_checkpoints_chat_idx" ON "model_call_tool_checkpoints" USING btree ("chat_id");
