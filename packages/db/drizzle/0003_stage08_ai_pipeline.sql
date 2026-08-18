ALTER TABLE "ai_tasks" ADD COLUMN "cache_key" text;
--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD COLUMN "result_json" jsonb;
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_cache_key_unique" UNIQUE("cache_key");
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_task_attempt_unique" UNIQUE("ai_task_id","attempt");
