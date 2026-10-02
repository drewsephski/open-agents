ALTER TABLE "chats" ALTER COLUMN "model_id" SET DEFAULT 'openai/gpt-6.1-sol';--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "default_model_id" SET DEFAULT 'openai/gpt-6.1-sol';