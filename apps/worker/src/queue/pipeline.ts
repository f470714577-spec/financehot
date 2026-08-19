import { and, eq, or, inArray } from 'drizzle-orm';

import {
  CrawlerError,
  SafeFetcher,
  createSourceAdapter,
  type RawItem,
  type SourceLike,
} from '@financehot/crawler';
import { type Db, articles, raw_articles, sources } from '@financehot/db';
import type { CrawlJobPayload, NormalizeJobPayload } from '@financehot/shared';

type WorkerDb = Db['db'];

export interface PipelineMetrics {
  requests: number;
  rawSeen: number;
  rawInserted: number;
  rawExisting: number;
  articlesInserted: number;
  articlesDuplicate: number;
  articleIds: string[];
  newArticleIds: string[];
}

export function emptyMetrics(): PipelineMetrics {
  return {
    requests: 0,
    rawSeen: 0,
    rawInserted: 0,
    rawExisting: 0,
    articlesInserted: 0,
    articlesDuplicate: 0,
    articleIds: [],
    newArticleIds: [],
  };
}

export function sourceToCrawler(row: typeof sources.$inferSelect): SourceLike {
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

export function errorDetails(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof CrawlerError) {
    return {
      message: `${error.kind}${error.status ? ` HTTP_${error.status}` : ''}: ${error.message}`.slice(0, 2_000),
      retryable: error.retryable || error.kind === 'network' || error.kind === 'timeout',
    };
  }
  return {
    message: `worker: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000),
    retryable: false,
  };
}

export async function dueSources(db: WorkerDb, now: Date) {
  const enabled = await db.select().from(sources).where(eq(sources.enabled, true));
  return enabled.filter((source) => {
    if (!source.last_crawled_at) return true;
    const interval = (source.crawl_interval ?? 3_600) * 1_000;
    return now.getTime() - source.last_crawled_at.getTime() >= interval;
  });
}

export async function loadSource(db: WorkerDb, sourceId: string) {
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!rows[0]) throw new CrawlerError(`source 不存在: ${sourceId}`, 'config');
  return rows[0];
}

export async function insertRawRows(
  db: WorkerDb,
  source: SourceLike,
  raw: RawItem[],
): Promise<{ ids: Map<string, string>; inserted: number; existing: number }> {
  const ids = new Map<string, string>();
  let inserted = 0;
  let existing = 0;
  await db.transaction(async (tx) => {
    for (const item of raw) {
      const values = {
        source_id: source.id,
        original_url: item.url || item.originalUrl,
        canonical_url: item.canonicalUrl ?? item.originalUrl,
        content_hash: item.contentHash,
        raw_content: item.rawContent,
        raw_title: item.rawTitle ?? item.title,
        fetched_at: new Date(item.fetchedAt),
        language: source.language,
        processing_status: 'pending' as const,
        parser_version: 'stage-07-v1',
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

function rawRowToItem(row: typeof raw_articles.$inferSelect, source: SourceLike): RawItem | undefined {
  const originalUrl = row.original_url ?? row.canonical_url;
  if (!originalUrl) return undefined;
  return {
    sourceId: row.source_id,
    originalUrl,
    canonicalUrl: row.canonical_url ?? originalUrl,
    rawTitle: row.raw_title ?? undefined,
    rawContent: row.raw_content ?? undefined,
    fetchedAt: row.fetched_at.toISOString(),
    contentType: source.type === 'rss' ? 'application/rss+xml' : source.type === 'api' ? 'application/json' : 'text/html',
    contentHash: row.content_hash,
    url: originalUrl,
    title: row.raw_title ?? undefined,
  };
}

export async function normalizeRawRows(
  db: WorkerDb,
  sourceRow: typeof sources.$inferSelect,
  rawIds: string[],
  now: Date,
): Promise<PipelineMetrics> {
  const metrics = emptyMetrics();
  const source = sourceToCrawler(sourceRow);
  const rows = await db.select().from(raw_articles).where(and(eq(raw_articles.source_id, source.id), inArray(raw_articles.id, rawIds)));
  const raw = rows.flatMap((row) => {
    const item = rawRowToItem(row, source);
    return item ? [{ row, item }] : [];
  });
  const adapter = createSourceAdapter(source.type);
  const parsed = await adapter.parse(raw.map(({ item }) => item), source);
  const normalized = await adapter.normalize(parsed, source);
  const normalizedRawIds = new Set(
    normalized.flatMap((item) => {
      const match = raw.find(({ item: rawItem }) => rawItem.originalUrl === item.originalUrl || rawItem.canonicalUrl === item.canonicalUrl);
      return match ? [match.row.id] : [];
    }),
  );

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!normalizedRawIds.has(row.id)) {
        await tx
          .update(raw_articles)
          .set({ processing_status: 'filtered_out', rejected_reason: 'Adapter 缺少必需标题/URL或字段校验失败', updated_at: now })
          .where(eq(raw_articles.id, row.id));
      }
    }
    for (const item of normalized) {
      const rawId = raw.find(({ item: rawItem }) => rawItem.originalUrl === item.originalUrl || rawItem.canonicalUrl === item.canonicalUrl)?.row.id;
      if (!rawId) continue;
      const duplicate = await tx
        .select({ id: articles.id })
        .from(articles)
        .where(or(eq(articles.canonical_url, item.canonicalUrl), eq(articles.content_hash, item.contentHash), eq(articles.title_hash, item.titleHash)))
        .limit(1);
      let articleId = duplicate[0]?.id;
      if (articleId) {
        metrics.articlesDuplicate += 1;
        metrics.articleIds.push(articleId);
        await tx
          .update(raw_articles)
          .set({ processing_status: 'duplicate', article_id: articleId, duplicate_of_article_id: articleId, rejected_reason: 'canonical_url/content_hash/title_hash 去重', updated_at: now })
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
        .onConflictDoNothing()
        .returning({ id: articles.id });
      articleId = created[0]?.id;
      if (!articleId) {
        const concurrent = await tx
          .select({ id: articles.id })
          .from(articles)
          .where(or(eq(articles.canonical_url, item.canonicalUrl), eq(articles.content_hash, item.contentHash), eq(articles.title_hash, item.titleHash)))
          .limit(1);
        articleId = concurrent[0]?.id;
        if (!articleId) throw new Error('article insert 冲突后未找到已存在文章');
        metrics.articlesDuplicate += 1;
        metrics.articleIds.push(articleId);
        await tx
          .update(raw_articles)
          .set({ processing_status: 'duplicate', article_id: articleId, duplicate_of_article_id: articleId, rejected_reason: 'canonical_url/content_hash/title_hash 并发去重', updated_at: now })
          .where(eq(raw_articles.id, rawId));
        continue;
      }
      metrics.articlesInserted += 1;
      metrics.articleIds.push(articleId);
      metrics.newArticleIds.push(articleId);
      await tx
        .update(raw_articles)
        .set({ processing_status: 'normalized', article_id: articleId, updated_at: now })
        .where(eq(raw_articles.id, rawId));
    }
  });
  await db.update(sources).set({ last_crawled_at: now, updated_at: now }).where(eq(sources.id, source.id));
  return metrics;
}

export async function crawlSource(
  db: WorkerDb,
  payload: CrawlJobPayload,
  fetcher: SafeFetcher,
  now: Date,
  enqueueNormalize: (payload: NormalizeJobPayload, jobId: string) => Promise<void>,
  normalizeJobId: (crawlTaskId: string, rawIds: string[]) => string,
  metrics: PipelineMetrics,
): Promise<{ rawIds: string[]; normalizeJobId?: string }> {
  const sourceRow = await loadSource(db, payload.sourceId);
  const source = sourceToCrawler(sourceRow);
  if (!source.enabled) throw new CrawlerError(`source 已禁用: ${source.id}`, 'config');
  if (!source.adapterConfig) throw new CrawlerError('缺少 adapter_config，未发起外部请求', 'config');
  const adapter = createSourceAdapter(source.type, fetcher);
  const raw = await adapter.fetch(source);
  metrics.requests += 1;
  metrics.rawSeen += raw.length;
  const rawResult = await insertRawRows(db, source, raw);
  metrics.rawInserted += rawResult.inserted;
  metrics.rawExisting += rawResult.existing;
  const rawIds = [...new Set(raw.flatMap((item) => {
    const id = rawResult.ids.get(item.contentHash) ?? rawResult.ids.get(item.canonicalUrl ?? item.originalUrl);
    return id ? [id] : [];
  }))];
  if (rawIds.length === 0) {
    await db.update(sources).set({ last_crawled_at: now, updated_at: now }).where(eq(sources.id, source.id));
    return { rawIds };
  }
  const nextPayload: NormalizeJobPayload = {
    version: 1,
    sourceId: payload.sourceId,
    crawlTaskId: payload.crawlTaskId,
    crawlJobId: `crawl-${payload.sourceId}-${new Date(payload.scheduledAt).getTime()}`,
    rawIds,
    scheduledAt: payload.scheduledAt,
  };
  const nextJobId = normalizeJobId(payload.crawlTaskId, rawIds);
  await enqueueNormalize(nextPayload, nextJobId);
  return { rawIds, normalizeJobId: nextJobId };
}
