ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE;
