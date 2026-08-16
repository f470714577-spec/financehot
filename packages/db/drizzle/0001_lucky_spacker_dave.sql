CREATE INDEX "articles_visible_published_id_idx" ON "articles" USING btree ("published_at" desc,"id" desc) WHERE "articles"."is_hidden" = false;--> statement-breakpoint
CREATE INDEX "event_articles_article_event_idx" ON "event_articles" USING btree ("article_id","event_id");--> statement-breakpoint
CREATE INDEX "article_categories_category_article_idx" ON "article_categories" USING btree ("category_id","article_id");--> statement-breakpoint
CREATE INDEX "article_countries_country_article_idx" ON "article_countries" USING btree ("country_id","article_id");--> statement-breakpoint
CREATE INDEX "article_tags_tag_article_idx" ON "article_tags" USING btree ("tag_id","article_id");