ALTER TABLE "ai_tasks" DROP CONSTRAINT "ai_tasks_article_id_articles_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE;
