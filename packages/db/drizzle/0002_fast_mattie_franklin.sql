ALTER TABLE "sources" ADD COLUMN "adapter_config" jsonb;
--> statement-breakpoint
UPDATE "sources"
SET "enabled" = false
WHERE "homepage" LIKE 'https://demo.%'
   OR "rss_url" LIKE 'https://demo.%';
