import { and, eq, or } from 'drizzle-orm';

import {
  CrawlerError,
  SafeFetcher,
  createSourceAdapter,
  type RawItem,
  type SourceLike,
} from '@financehot/crawler';
import { type Db, articles, crawl_tasks, raw_articles, sources } from '@financehot/db';

type WorkerDb = Db['db'];

export interface CrawlOnceOptions {
  db: WorkerDb;
  fetcher?: SafeFetcher;
  now?: () => Date;
  maxTaskRetries?: number;
}

export interface CrawlOnceStats {
  startedAt: string;
  sourcesDue: number;
  tasksCreated: number;
  tasksSuccess: number;
  tasksFailed: number;
  tasksRetrying: number;
  requests: number;
  rawSeen: number;
  rawInserted: number;
  rawExisting: number;
  articlesInserted: number;
  articlesDuplicate: number;
}

function sourceToCrawler(row: typeof sources.$inferSelect): SourceLike {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    country: row.country,
    language: row.language,
    homepage: row.homepage,
    rssUrl: row.rss_url,
    sourceLevel: row.source_level,
    enabled: row.enabled,
    crawlInterval: row.crawl_interval ?? 3_600,
    adapterConfig: row.adapter_config,
  };
}

function errorDetails(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof CrawlerError) {
    return {
      message: `${error.kind}${error.status ? ` HTTP_${error.status}` : ''}: ${error.message}`.slice(0, 2_000),
      retryable: error.retryable || error.kind === 'network' || error.kind === 'timeout',
    };
  }
  return { message: `worker: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000), retryable: false };
}

async function dueSources(db: WorkerDb, now: Date) {
  const enabled = await db.select().from(sources).where(eq(sources.enabled, true));
  return enabled.filter((source) => {
    if (!source.last_crawled_at) return true;
    const interval = (source.crawl_interval ?? 3_600) * 1_000;
    return now.getTime() - source.last_crawled_at.getTime() >= interval;
  });
}

async function createRunningTask(db: WorkerDb, sourceId: string, scheduledAt: Date) {
  const rows = await db
    .insert(crawl_tasks)
    .values({ source_id: sourceId, status: 'running', scheduled_at: scheduledAt, started_at: scheduledAt })
    .onConflictDoNothing()
    .returning({ id: crawl_tasks.id });
  return rows[0]?.id;
}

async function finishTask(
  db: WorkerDb,
  taskId: string,
  status: 'success' | 'failed' | 'retrying',
  now: Date,
  error?: string,
  retryCount = 0,
) {
  await db
    .update(crawl_tasks)
    .set({ status, error: error ?? null, retry_count: retryCount, finished_at: now, updated_at: now })
    .where(eq(crawl_tasks.id, taskId));
}

async function insertRawRows(db: WorkerDb, source: SourceLike, raw: RawItem[]): Promise<{ ids: Map<string, string>; inserted: number; existing: number }> {
  const ids = new Map<string, string>();
  let inserted = 0;
  let existing = 0;
  await db.transaction(async (tx) => {
    for (const item of raw) {
      const values = {
        source_id: source.id,
        original_url: item.url,
        canonical_url: item.canonicalUrl ?? item.originalUrl,
        content_hash: item.contentHash,
        raw_content: item.rawContent,
        raw_title: item.rawTitle ?? item.title,
        fetched_at: new Date(item.fetchedAt),
        language: source.language,
        processing_status: 'pending' as const,
        parser_version: 'stage-06-v1',
      };
      const created = await tx.insert(raw_articles).values(values).onConflictDoNothing().returning({ id: raw_articles.id });
      if (created[0]) {
        inserted += 1;
        ids.set(item.contentHash, created[0].id);
        ids.set(item.originalUrl, created[0].id);
        ids.set(item.canonicalUrl ?? item.originalUrl, created[0].id);
      } else {
        existing += 1;
        const old = await tx
          .select({ id: raw_articles.id })
          .from(raw_articles)
          .where(and(eq(raw_articles.source_id, source.id), eq(raw_articles.content_hash, item.contentHash)))
          .limit(1);
        if (old[0]) {
          ids.set(item.contentHash, old[0].id);
          ids.set(item.originalUrl, old[0].id);
          ids.set(item.canonicalUrl ?? item.originalUrl, old[0].id);
        }
      }
    }
  });
  return { ids, inserted, existing };
}

async function persistNormalized(
  db: WorkerDb,
  source: SourceLike,
  raw: RawItem[],
  rawIds: Map<string, string>,
  normalized: Awaited<ReturnType<ReturnType<typeof createSourceAdapter>['normalize']>>,
) {
  let articlesInserted = 0;
  let articlesDuplicate = 0;
  const normalizedRawIds = new Set(
    normalized.flatMap((item) => {
      const rawId = rawIds.get(item.canonicalUrl) ?? rawIds.get(item.originalUrl);
      return rawId ? [rawId] : [];
    }),
  );
  await db.transaction(async (tx) => {
    for (const item of raw) {
      const rawId = rawIds.get(item.contentHash);
      if (!rawId) continue;
      if (!normalizedRawIds.has(rawId)) {
        await tx
          .update(raw_articles)
          .set({ processing_status: 'filtered_out', rejected_reason: 'Adapter 缺少必需标题/URL或字段校验失败', updated_at: new Date() })
          .where(eq(raw_articles.id, rawId));
      }
    }
    for (const item of normalized) {
      const rawId = rawIds.get(item.canonicalUrl) ?? rawIds.get(item.originalUrl);
      if (!rawId) continue;
      const duplicate = await tx
        .select({ id: articles.id })
        .from(articles)
        .where(or(eq(articles.canonical_url, item.canonicalUrl), eq(articles.content_hash, item.contentHash), eq(articles.title_hash, item.titleHash)))
        .limit(1);
      let articleId = duplicate[0]?.id;
      if (articleId) {
        articlesDuplicate += 1;
        await tx
          .update(raw_articles)
          .set({ processing_status: 'duplicate', article_id: articleId, duplicate_of_article_id: articleId, rejected_reason: 'canonical_url/content_hash/title_hash 去重', updated_at: new Date() })
          .where(eq(raw_articles.id, rawId));
        continue;
      }
      const created = await tx
        .insert(articles)
        .values({
          source_id: source.id,
          original_url: item.originalUrl,
          canonical_url: item.canonicalUrl,
          content_hash: item.contentHash,
          title_hash: item.titleHash,
          original_title: item.originalTitle,
          original_summary: item.originalSummary,
          original_language: item.originalLanguage,
          published_at: item.publishedAt ? new Date(item.publishedAt) : null,
          fetched_at: new Date(item.fetchedAt),
          processing_status: 'normalized',
        })
        .returning({ id: articles.id });
      articleId = created[0]?.id;
      if (!articleId) throw new Error('article insert 未返回 id');
      articlesInserted += 1;
      await tx
        .update(raw_articles)
        .set({ processing_status: 'normalized', article_id: articleId, updated_at: new Date() })
        .where(eq(raw_articles.id, rawId));
    }
  });
  return { articlesInserted, articlesDuplicate };
}

async function runSource(
  db: WorkerDb,
  row: typeof sources.$inferSelect,
  taskId: string,
  now: Date,
  fetcher: SafeFetcher,
  stats: CrawlOnceStats,
  maxTaskRetries: number,
) {
  const source = sourceToCrawler(row);
  try {
    if (!source.adapterConfig) throw new CrawlerError('缺少 adapter_config，未发起外部请求', 'config');
    const adapter = createSourceAdapter(source.type, fetcher);
    const raw = await adapter.fetch(source);
    stats.requests += 1;
    stats.rawSeen += raw.length;
    const rawResult = await insertRawRows(db, source, raw);
    stats.rawInserted += rawResult.inserted;
    stats.rawExisting += rawResult.existing;
    const parsed = await adapter.parse(raw, source);
    const normalized = await adapter.normalize(parsed, source);
    const articleResult = await persistNormalized(db, source, raw, rawResult.ids, normalized);
    stats.articlesInserted += articleResult.articlesInserted;
    stats.articlesDuplicate += articleResult.articlesDuplicate;
    await db.update(sources).set({ last_crawled_at: now, updated_at: now }).where(eq(sources.id, source.id));
    await finishTask(db, taskId, 'success', now);
    stats.tasksSuccess += 1;
  } catch (error) {
    const details = errorDetails(error);
    const retrying = details.retryable && maxTaskRetries > 0;
    await finishTask(db, taskId, retrying ? 'retrying' : 'failed', now, details.message, retrying ? 1 : 0);
    if (retrying) stats.tasksRetrying += 1;
    else stats.tasksFailed += 1;
  }
}

export async function crawlOnce(options: CrawlOnceOptions): Promise<CrawlOnceStats> {
  const now = options.now?.() ?? new Date();
  const stats: CrawlOnceStats = {
    startedAt: now.toISOString(),
    sourcesDue: 0,
    tasksCreated: 0,
    tasksSuccess: 0,
    tasksFailed: 0,
    tasksRetrying: 0,
    requests: 0,
    rawSeen: 0,
    rawInserted: 0,
    rawExisting: 0,
    articlesInserted: 0,
    articlesDuplicate: 0,
  };
  const due = await dueSources(options.db, now);
  stats.sourcesDue = due.length;
  const fetcher = options.fetcher ?? new SafeFetcher({ minIntervalMs: 1_000 });
  for (const row of due) {
    const taskId = await createRunningTask(options.db, row.id, now);
    if (!taskId) continue;
    stats.tasksCreated += 1;
    await runSource(options.db, row, taskId, now, fetcher, stats, options.maxTaskRetries ?? 1);
  }
  return stats;
}
