ALTER TABLE "ai_usage" ADD COLUMN "provider_attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "outcome" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "http_status" integer;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "usage_reported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_task_attempt_unique";--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_task_attempt_provider_attempt_unique" UNIQUE("ai_task_id","attempt","provider_attempt");
