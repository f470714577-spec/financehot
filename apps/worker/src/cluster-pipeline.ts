import {
  ai_tasks,
  article_categories,
  article_embeddings,
  articles,
  categories,
  event_articles,
  events,
  type Db,
} from '@financehot/db';
import { and, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';

import { embeddingInputHash } from './embedding-pipeline';

type WorkerDb = Db['db'];
type WorkerTransaction = Parameters<WorkerDb['transaction']>[0] extends (tx: infer Tx) => Promise<unknown> ? Tx : never;
type WorkerQuery = WorkerDb | WorkerTransaction;

const DEFAULT_SIMILARITY_THRESHOLD = 0.86;
const DEFAULT_TIME_WINDOW_HOURS = 72;
const CLUSTER_TRANSACTION_LOCK_KEY = 90209;

export interface ClusterPipelineOptions {
  db: WorkerDb;
  now?: () => Date;
  similarityThreshold?: number;
  timeWindowHours?: number;
}

export interface ClusterProcessResult {
  status: 'processed' | 'cached' | 'busy';
  articleId: string;
  taskId: string;
  eventId?: string;
  similarity?: number;
}

function seenAt(article: typeof articles.$inferSelect): Date {
  return article.published_at ?? article.fetched_at ?? article.created_at;
}

function normalizeThreshold(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_SIMILARITY_THRESHOLD;
}

function normalizeHours(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_TIME_WINDOW_HOURS;
}

async function claimTask(db: WorkerDb, taskId: string, attemptNumber: number, now: Date) {
  const claimableStatuses = attemptNumber > 1
    ? or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying'), and(eq(ai_tasks.status, 'running'), lt(ai_tasks.retry_count, attemptNumber)))
    : or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying'));
  const claimed = await db.update(ai_tasks).set({
    status: 'running',
    retry_count: Math.max(0, attemptNumber - 1),
    error: null,
    updated_at: now,
  }).where(and(
    eq(ai_tasks.id, taskId),
    claimableStatuses,
  )).returning();
  if (claimed[0]) return { task: claimed[0], acquired: true };
  return {
    task: (await db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0],
    acquired: false,
  };
}

async function loadArticle(db: WorkerDb, articleId: string) {
  const rows = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!rows[0]) throw new Error(`article 不存在: ${articleId}`);
  return rows[0];
}

async function loadEmbedding(db: WorkerDb, task: typeof ai_tasks.$inferSelect) {
  if (!task.article_id || !task.provider || !task.model || !task.input_hash || !task.prompt_version) return undefined;
  return (await db.select().from(article_embeddings).where(and(
    eq(article_embeddings.article_id, task.article_id),
    eq(article_embeddings.provider, task.provider),
    eq(article_embeddings.model, task.model),
    eq(article_embeddings.input_hash, task.input_hash),
    eq(article_embeddings.embedding_version, task.prompt_version),
  )).limit(1))[0];
}

async function articleCategories(db: WorkerQuery, articleIds: string[]) {
  if (!articleIds.length) return new Map<string, Set<string>>();
  const rows = await db.select({ articleId: article_categories.article_id, slug: categories.slug })
    .from(article_categories)
    .innerJoin(categories, eq(categories.id, article_categories.category_id))
    .where(inArray(article_categories.article_id, articleIds));
  const result = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = result.get(row.articleId) ?? new Set<string>();
    set.add(row.slug);
    result.set(row.articleId, set);
  }
  return result;
}

function categoriesCompatible(current: Set<string>, candidate: Set<string>) {
  if (!current.size || !candidate.size) return true;
  for (const slug of current) if (candidate.has(slug)) return true;
  return false;
}

interface Candidate {
  eventId: string;
  similarity: number;
  memberIds: string[];
}

async function findCandidate(
  db: WorkerQuery,
  article: typeof articles.$inferSelect,
  embedding: typeof article_embeddings.$inferSelect,
  threshold: number,
  timeWindowHours: number,
): Promise<Candidate | undefined> {
  const vectorLiteral = JSON.stringify(embedding.embedding);
  const similarity = sql<number>`1 - (${article_embeddings.embedding} <=> ${vectorLiteral}::vector)`;
  const rows = await db.select({
    eventId: event_articles.event_id,
    memberId: event_articles.article_id,
    memberPublishedAt: articles.published_at,
    memberFetchedAt: articles.fetched_at,
    memberCreatedAt: articles.created_at,
    memberTitleZh: articles.title_zh,
    memberSummaryZh: articles.summary_zh,
    inputHash: article_embeddings.input_hash,
    similarity,
  })
    .from(event_articles)
    .innerJoin(articles, eq(articles.id, event_articles.article_id))
    .innerJoin(article_embeddings, eq(article_embeddings.article_id, event_articles.article_id))
    .where(and(
      ne(event_articles.article_id, article.id),
      eq(articles.is_hidden, false),
      eq(article_embeddings.provider, embedding.provider),
      eq(article_embeddings.model, embedding.model),
      eq(article_embeddings.dimensions, embedding.dimensions),
      eq(article_embeddings.embedding_version, embedding.embedding_version),
    ));
  const currentTime = seenAt(article).getTime();
  const windowMs = timeWindowHours * 60 * 60 * 1_000;
  const byEvent = new Map<string, Candidate>();
  for (const row of rows) {
    const memberInputHash = embeddingInputHash({
      title_zh: row.memberTitleZh,
      summary_zh: row.memberSummaryZh,
    });
    if (!memberInputHash || memberInputHash !== row.inputHash) continue;

    const candidateTime = (row.memberPublishedAt ?? row.memberFetchedAt ?? row.memberCreatedAt).getTime();
    const score = Number(row.similarity);
    if (!Number.isFinite(score) || score < threshold || Math.abs(candidateTime - currentTime) > windowMs) continue;
    const current = byEvent.get(row.eventId);
    if (!current) {
      byEvent.set(row.eventId, { eventId: row.eventId, similarity: score, memberIds: [row.memberId] });
    } else {
      current.memberIds.push(row.memberId);
      current.similarity = Math.max(current.similarity, score);
    }
  }
  if (!byEvent.size) return undefined;
  const currentCategories = (await articleCategories(db, [article.id])).get(article.id) ?? new Set<string>();
  const candidates = [...byEvent.values()];
  const categoryRows = await articleCategories(db, candidates.flatMap((candidate) => candidate.memberIds));
  const compatible = candidates.filter((candidate) => {
    const categorySet = new Set<string>();
    for (const memberId of candidate.memberIds) {
      for (const slug of categoryRows.get(memberId) ?? []) categorySet.add(slug);
    }
    return categoriesCompatible(currentCategories, categorySet);
  });
  compatible.sort((left, right) => right.similarity - left.similarity);
  return compatible[0];
}

async function recomputeEvent(tx: WorkerTransaction, eventId: string, now: Date) {
  const aggregate = (await tx.select({
    articleCount: sql<number>`count(*)`,
    sourceCount: sql<number>`count(distinct ${articles.source_id})`,
    firstSeenAt: sql<Date | null>`min(coalesce(${articles.published_at}, ${articles.fetched_at}, ${articles.created_at}))`,
    lastSeenAt: sql<Date | null>`max(coalesce(${articles.published_at}, ${articles.fetched_at}, ${articles.created_at}))`,
  }).from(event_articles).innerJoin(articles, eq(articles.id, event_articles.article_id)).where(eq(event_articles.event_id, eventId)))[0];
  const firstSeenAt = aggregate?.firstSeenAt instanceof Date
    ? aggregate.firstSeenAt
    : aggregate?.firstSeenAt ? new Date(String(aggregate.firstSeenAt)) : null;
  const lastSeenAt = aggregate?.lastSeenAt instanceof Date
    ? aggregate.lastSeenAt
    : aggregate?.lastSeenAt ? new Date(String(aggregate.lastSeenAt)) : null;
  await tx.update(events).set({
    article_count: Number(aggregate?.articleCount ?? 0),
    source_count: Number(aggregate?.sourceCount ?? 0),
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    updated_at: now,
  }).where(eq(events.id, eventId));
}

async function persistCluster(
  tx: WorkerTransaction,
  task: typeof ai_tasks.$inferSelect,
  article: typeof articles.$inferSelect,
  candidate: Candidate | undefined,
  now: Date,
) {
  if (!task.article_id) throw new Error(`cluster task 缺少 article_id: ${task.id}`);
  const existingRelation = (await tx.select({ eventId: event_articles.event_id })
    .from(event_articles).where(eq(event_articles.article_id, task.article_id!)).limit(1))[0];
  if (existingRelation) {
    await tx.update(articles).set({ processing_status: 'clustered', updated_at: now }).where(eq(articles.id, task.article_id!));
    await tx.update(ai_tasks).set({
      status: 'success',
      result_json: { eventId: existingRelation.eventId, similarity: 1, cached: true },
      error: null,
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
    await recomputeEvent(tx, existingRelation.eventId, now);
    return { eventId: existingRelation.eventId, similarity: 1, cached: true };
  }

    let eventId = candidate?.eventId;
    const similarity = candidate?.similarity ?? 1;
    let isPrimary = false;
    if (!eventId) {
      const insertedEvent = (await tx.insert(events).values({
        title: article.title_zh ?? article.original_title ?? article.canonical_url,
        summary: article.summary_zh ?? article.original_summary,
        first_seen_at: seenAt(article),
        last_seen_at: seenAt(article),
        article_count: 0,
        source_count: 0,
        status: 'developing',
      }).returning({ id: events.id }))[0];
      if (!insertedEvent) throw new Error(`创建 Event 失败: ${article.id}`);
      eventId = insertedEvent.id;
      isPrimary = true;
    } else {
      const primary = await tx.select({ id: event_articles.id }).from(event_articles).where(and(
        eq(event_articles.event_id, eventId),
        eq(event_articles.is_primary, true),
      )).limit(1);
      isPrimary = primary.length === 0;
    }
    await tx.insert(event_articles).values({
      event_id: eventId,
      article_id: task.article_id!,
      is_primary: isPrimary,
      similarity_score: similarity,
      confidence: similarity,
      cluster_method: 'embedding',
    }).onConflictDoNothing();
    await tx.update(articles).set({ processing_status: 'clustered', updated_at: now }).where(eq(articles.id, task.article_id!));
    await tx.update(ai_tasks).set({
      status: 'success',
      result_json: { eventId, similarity, cached: false },
      error: null,
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
    await recomputeEvent(tx, eventId, now);
  return { eventId, similarity, cached: false };
}

export async function processClusterTask(
  options: ClusterPipelineOptions,
  taskId: string,
  attemptNumber: number,
): Promise<ClusterProcessResult> {
  const now = options.now ?? (() => new Date());
  const initial = (await options.db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0];
  if (!initial || initial.task_type !== 'event-cluster' || !initial.article_id) throw new Error(`cluster task 不存在或类型错误: ${taskId}`);
  const article = await loadArticle(options.db, initial.article_id);
  if (article.is_hidden || article.processing_status !== 'embedded') throw new Error(`Article 不满足 Embedding 后可聚类条件: ${article.id}`);
  const claim = await claimTask(options.db, taskId, attemptNumber, now());
  if (!claim.task || claim.task.status === 'success') {
    const result = claim.task?.result_json;
    return { status: 'cached', articleId: initial.article_id, taskId, eventId: typeof result?.eventId === 'string' ? result.eventId : undefined };
  }
  if (!claim.acquired) return { status: 'busy', articleId: initial.article_id, taskId };
  const embedding = await loadEmbedding(options.db, claim.task);
  if (!embedding) throw new Error(`cluster 缺少对应 embedding: ${initial.article_id}`);
  const result = await options.db.transaction(async (tx) => {
    // 事件候选查询必须和关系写入在同一串行化事务内，否则两个 Worker
    // 会同时看不到候选并各自创建 Event。
    await tx.execute(sql`select pg_advisory_xact_lock(${CLUSTER_TRANSACTION_LOCK_KEY})`);
    const candidate = await findCandidate(
      tx,
      article,
      embedding,
      normalizeThreshold(options.similarityThreshold),
      normalizeHours(options.timeWindowHours),
    );
    return persistCluster(tx, claim.task, article, candidate, now());
  });
  return {
    status: result.cached ? 'cached' : 'processed',
    articleId: initial.article_id,
    taskId,
    eventId: result.eventId,
    similarity: result.similarity,
  };
}

export function clusterTaskError(error: unknown) {
  return {
    retryable: false,
    message: `cluster: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000),
  };
}

export const clusterDefaults = {
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  timeWindowHours: DEFAULT_TIME_WINDOW_HOURS,
};
