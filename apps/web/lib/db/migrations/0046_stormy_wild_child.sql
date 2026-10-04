CREATE TABLE "action_runtime_sessions" (
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"scope" jsonb NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "action_runtime_sessions_user_id_chat_id_provider_id_scope_key_pk" PRIMARY KEY("user_id","chat_id","provider_id","scope_key")
);
--> statement-breakpoint
ALTER TABLE "action_provider_sessions" ADD COLUMN "toolkit" text DEFAULT 'gmail' NOT NULL;--> statement-breakpoint
ALTER TABLE "action_provider_sessions" DROP CONSTRAINT "action_provider_sessions_user_id_provider_id_pk";--> statement-breakpoint
ALTER TABLE "action_provider_sessions" ADD CONSTRAINT "action_provider_sessions_user_id_provider_id_toolkit_pk" PRIMARY KEY("user_id","provider_id","toolkit");--> statement-breakpoint
ALTER TABLE "action_runtime_sessions" ADD CONSTRAINT "action_runtime_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_runtime_sessions" ADD CONSTRAINT "action_runtime_sessions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;