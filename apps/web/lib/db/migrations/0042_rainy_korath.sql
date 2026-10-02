CREATE TABLE "action_executions" (
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "action_executions_user_id_chat_id_tool_call_id_pk" PRIMARY KEY("user_id","chat_id","tool_call_id")
);
--> statement-breakpoint
CREATE TABLE "action_provider_sessions" (
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "action_provider_sessions_user_id_provider_id_pk" PRIMARY KEY("user_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_provider_sessions" ADD CONSTRAINT "action_provider_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;