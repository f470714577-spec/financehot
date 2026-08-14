import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from '../client';
import * as schema from '../schema';
import {
  demoCategories,
  demoCountries,
  demoDailyReport,
  demoEvents,
  demoSources,
  demoStandaloneArticles,
  demoTags,
  demoTopics,
  type DemoArticleSeed,
} from './data';

// 尝试加载根目录 .env（若存在），否则回退到本地 docker 默认连接串
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

const HOUR_MS = 3_600_000;

async function main() {
  const { db, pool } = createDb(DATABASE_URL);
  const counts: Record<string, number> = {};

  try {
    // 幂等：清空全部表（依赖序无所谓，CASCADE 处理外键）
    await db.execute(sql`
      TRUNCATE TABLE
        daily_reports, ai_usage, ai_tasks, crawl_tasks,
        event_topics, topic_articles, event_timeline, event_articles,
        article_countries, article_tags, article_categories,
        countries, tags, categories, topics,
        article_embeddings, raw_articles, articles, events, sources
      CASCADE
    `);

    // 1. sources
    const insertedSources = await db
      .insert(schema.sources)
      .values(
        demoSources.map((s) => ({
          name: s.name,
          type: s.type,
          country: s.country,
          language: s.language,
          homepage: s.homepage,
          rss_url: s.rssUrl,
          source_level: s.sourceLevel,
          credibility_score: s.credibilityScore,
          enabled: true,
          crawl_interval: s.crawlInterval,
        })),
      )
      .returning({ id: schema.sources.id });
    counts.sources = insertedSources.length;

    // 2. categories
    const insertedCategories = await db
      .insert(schema.categories)
      .values(
        demoCategories.map((c) => ({
          name: c.name,
          slug: c.slug,
          sort_order: c.sortOrder,
        })),
      )
      .returning({ id: schema.categories.id, slug: schema.categories.slug });
    counts.categories = insertedCategories.length;
    const categoryIdBySlug = new Map(insertedCategories.map((c) => [c.slug, c.id]));

    // 3. tags
    const insertedTags = await db
      .insert(schema.tags)
      .values(
        demoTags.map((t) => ({
          name: t.name,
          slug: t.name,
          kind: t.kind,
        })),
      )
      .returning({ id: schema.tags.id, name: schema.tags.name });
    counts.tags = insertedTags.length;
    const tagIdByName = new Map(insertedTags.map((t) => [t.name, t.id]));

    // 4. countries
    const insertedCountries = await db
      .insert(schema.countries)
      .values(
        demoCountries.map((c) => ({
          name_zh: c.nameZh,
          name_en: c.nameEn,
          code: c.code,
        })),
      )
      .returning({ id: schema.countries.id, code: schema.countries.code });
    counts.countries = insertedCountries.length;
    const countryIdByCode = new Map(insertedCountries.map((c) => [c.code, c.id]));

    // 5. topics
    const insertedTopics = await db
      .insert(schema.topics)
      .values(
        demoTopics.map((t) => ({
          name: t.name,
          slug: t.slug,
          description: t.description,
          heat_score: t.heatScore,
        })),
      )
      .returning({ id: schema.topics.id, slug: schema.topics.slug });
    counts.topics = insertedTopics.length;
    const topicIdBySlug = new Map(insertedTopics.map((t) => [t.slug, t.id]));

    const now = Date.now();

    // 关联收集数组（事件文章 + 独立文章共用）
    const articleCategoryValues: Array<typeof schema.article_categories.$inferInsert> = [];
    const articleTagValues: Array<typeof schema.article_tags.$inferInsert> = [];
    const articleCountryValues: Array<typeof schema.article_countries.$inferInsert> = [];

    // 插入单条 article 并收集分类/标签/国家关联，返回 articleId
    const insertArticle = async (a: DemoArticleSeed): Promise<string> => {
      const source = demoSources[a.sourceIndex];
      const canonicalUrl = `https://demo.financehot.local/a/${hash(a.titleZh).slice(0, 16)}`;
      const publishedAt = new Date(now - a.hoursAgo * HOUR_MS);

      const inserted = await db
        .insert(schema.articles)
        .values({
          source_id: insertedSources[a.sourceIndex].id,
          original_url: canonicalUrl,
          canonical_url: canonicalUrl,
          content_hash: hash(a.titleZh + a.summaryZh),
          title_hash: hash(a.titleZh),
          original_title: a.titleZh,
          title_zh: a.titleZh,
          original_summary: a.summaryZh,
          summary_zh: a.summaryZh,
          original_language: source.language,
          published_at: publishedAt,
          fetched_at: new Date(publishedAt.getTime() + 5 * 60_000),
          finance_score: a.financeScore,
          financial_relevance_score: 85 + (a.financeScore % 10),
          importance_score: a.financeScore,
          market_impact_score: a.marketImpactScore,
          source_quality_score: source.credibilityScore,
          is_featured: a.featured ?? false,
          is_hidden: false,
          ai_reason: '[Demo] 模拟分析：该事件对相关市场有显著影响。',
          processing_status: 'published',
        })
        .returning({ id: schema.articles.id });

      const articleId = inserted[0].id;

      articleCategoryValues.push({
        article_id: articleId,
        category_id: categoryIdBySlug.get(a.categorySlug)!,
        confidence: 0.95,
      });
      for (const tagName of a.tagNames) {
        articleTagValues.push({
          article_id: articleId,
          tag_id: tagIdByName.get(tagName)!,
        });
      }
      a.countryCodes.forEach((code, ci) => {
        articleCountryValues.push({
          article_id: articleId,
          country_id: countryIdByCode.get(code)!,
          role: ci === 0 ? 'primary' : 'mentioned',
        });
      });

      return articleId;
    };

    // 6. 事件文章 → articles，记录 articleId 与所属事件/下标
    const articleLinks: Array<{
      articleId: string;
      eventIndex: number;
      articleIndex: number;
    }> = [];
    for (let ei = 0; ei < demoEvents.length; ei++) {
      const event = demoEvents[ei];
      for (let ai = 0; ai < event.articles.length; ai++) {
        const articleId = await insertArticle(event.articles[ai]);
        articleLinks.push({ articleId, eventIndex: ei, articleIndex: ai });
      }
    }

    // 6b. 独立文章（非事件新闻）→ articles
    for (const a of demoStandaloneArticles) {
      await insertArticle(a);
    }
    counts.articles = articleLinks.length + demoStandaloneArticles.length;

    // 7. events（派生 article_count / source_count / finance_score / heat_score）
    const eventIds: string[] = [];
    for (let ei = 0; ei < demoEvents.length; ei++) {
      const event = demoEvents[ei];
      const articleCount = event.articles.length;
      const sourceCount = new Set(event.articles.map((a) => a.sourceIndex)).size;
      const maxFinance = Math.max(...event.articles.map((a) => a.financeScore));
      const lastSeenHoursAgo = Math.min(...event.articles.map((a) => a.hoursAgo));

      const inserted = await db
        .insert(schema.events)
        .values({
          slug: null,
          title: event.title,
          summary: event.summary,
          finance_score: maxFinance,
          heat_score: Math.min(99, 45 + articleCount * 6),
          first_seen_at: new Date(now - event.firstSeenHoursAgo * HOUR_MS),
          last_seen_at: new Date(now - lastSeenHoursAgo * HOUR_MS),
          article_count: articleCount,
          source_count: sourceCount,
          status: event.status,
        })
        .returning({ id: schema.events.id });
      eventIds.push(inserted[0].id);
    }
    counts.events = eventIds.length;

    // 8. event_articles + topic_articles（事件级关联）
    const eventArticleValues: Array<typeof schema.event_articles.$inferInsert> = [];
    const topicArticleValues: Array<typeof schema.topic_articles.$inferInsert> = [];
    for (const link of articleLinks) {
      const event = demoEvents[link.eventIndex];
      const eventId = eventIds[link.eventIndex];

      eventArticleValues.push({
        event_id: eventId,
        article_id: link.articleId,
        is_primary: link.articleIndex === event.primaryArticleIndex,
        similarity_score: 0.9,
        confidence: 0.92,
        cluster_method: 'title',
      });

      for (const topicSlug of event.topicSlugs) {
        topicArticleValues.push({
          topic_id: topicIdBySlug.get(topicSlug)!,
          article_id: link.articleId,
        });
      }
    }

    await db.insert(schema.event_articles).values(eventArticleValues);
    counts.event_articles = eventArticleValues.length;
    await db.insert(schema.article_categories).values(articleCategoryValues);
    counts.article_categories = articleCategoryValues.length;
    await db.insert(schema.article_tags).values(articleTagValues);
    counts.article_tags = articleTagValues.length;
    await db.insert(schema.article_countries).values(articleCountryValues);
    counts.article_countries = articleCountryValues.length;
    await db.insert(schema.topic_articles).values(topicArticleValues);
    counts.topic_articles = topicArticleValues.length;

    // 9. event_topics
    const eventTopicValues: Array<typeof schema.event_topics.$inferInsert> = [];
    for (let ei = 0; ei < demoEvents.length; ei++) {
      for (const topicSlug of demoEvents[ei].topicSlugs) {
        eventTopicValues.push({
          topic_id: topicIdBySlug.get(topicSlug)!,
          event_id: eventIds[ei],
        });
      }
    }
    await db.insert(schema.event_topics).values(eventTopicValues);
    counts.event_topics = eventTopicValues.length;

    // 10. daily_reports
    await db
      .insert(schema.daily_reports)
      .values({
        date: demoDailyReport.date,
        timezone: demoDailyReport.timezone,
        model: demoDailyReport.model,
        prompt_version: demoDailyReport.promptVersion,
        content_json: demoDailyReport.content,
      });
    counts.daily_reports = 1;

    console.log('[Demo] Seed 完成，各表插入计数：');
    for (const [table, n] of Object.entries(counts)) {
      console.log(`  ${table}: ${n}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[Demo] Seed 失败：', err);
  process.exit(1);
});
