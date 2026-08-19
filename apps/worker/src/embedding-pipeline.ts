import { createHash } from 'node:crypto';

import {
  createEmbeddingProvider,
  loadEmbeddingConfig,
  type EmbeddingConfig,
  type EmbeddingProvider,
} from '@financehot/ai';
import {
  ai_tasks,
  article_embeddings,
  articles,
  type Db,
} from '@financehot/db';
import { and, eq, lt, or } from 'drizzle-orm';
import type { EmbeddingJobPayload, ClusterJobPayload } from '@financehot/shared';

type WorkerDb = Db['db'];
type WorkerTransaction = Parameters<WorkerDb['transaction']>[0] extends (tx: infer Tx) => Promise<unknown> ? Tx : never;

export interface EmbeddingTaskHandle {
  task: typeof ai_tasks.$inferSelect;
  article: typeof articles.$inferSelect;
  inputText: string;
  inputHash: string;
  embeddingVersion: string;
}

export interface EmbeddingPipelineOptions {
  db: WorkerDb;
  provider?: EmbeddingProvider;
  config?: EmbeddingConfig;
  now?: () => Date;
  enqueueCluster: (payload: ClusterJobPayload, jobId: string) => Promise<void>;
}

export interface EmbeddingProcessResult {
  status: 'processed' | 'cached' | 'busy';
  articleId: string;
  taskId: string;
  dimensions?: number;
  providerCalled: boolean;
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function providerName(config: EmbeddingConfig) {
  return config.provider ?? 'unconfigured';
}

function modelName(config: EmbeddingConfig) {
  return config.model ?? 'unconfigured';
}

export function normalizedEmbeddingInput(article: typeof articles.$inferSelect): string | undefined {
  const title = article.title_zh?.trim();
  const summary = article.summary_zh?.trim();
  if (!title || !summary) return undefined;
  return `${title}\n${summary}`;
}

export function embeddingCacheKey(args: {
  articleId: string;
  inputHash: string;
  embeddingVersion: string;
  provider: string;
  model: string;
}) {
  return [
    `article:${args.articleId}`,
    'task_type:embedding',
    `input_hash:${args.inputHash}`,
    `embedding_version:${args.embeddingVersion}`,
    `provider:${args.provider}`,
    `model:${args.model}`,
  ].join('|');
}

async function loadArticle(db: WorkerDb, articleId: string) {
  const rows = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!rows[0]) throw new Error(`article 不存在: ${articleId}`);
  return rows[0];
}

function isEligibleArticle(article: typeof articles.$inferSelect) {
  return !article.is_hidden && article.processing_status === 'entity_extracted';
}

export async function createOrGetEmbeddingTask(
  db: WorkerDb,
  articleId: string,
  config: EmbeddingConfig = loadEmbeddingConfig(),
): Promise<EmbeddingTaskHandle | undefined> {
  const article = await loadArticle(db, articleId);
  if (!isEligibleArticle(article)) return undefined;
  const inputText = normalizedEmbeddingInput(article);
  if (!inputText) return undefined;
  const inputHash = digest(inputText);
  const embeddingVersion = config.embeddingVersion;
  const cacheKey = embeddingCacheKey({
    articleId,
    inputHash,
    embeddingVersion,
    provider: providerName(config),
    model: modelName(config),
  });
  const inserted = await db.insert(ai_tasks).values({
    task_type: 'embedding',
    article_id: articleId,
    status: 'pending',
    prompt_version: embeddingVersion,
    model: modelName(config),
    provider: providerName(config),
    input_hash: inputHash,
    cache_key: cacheKey,
  }).onConflictDoNothing({ target: ai_tasks.cache_key }).returning();
  const task = inserted[0] ?? (await db.select().from(ai_tasks).where(eq(ai_tasks.cache_key, cacheKey)).limit(1))[0];
  if (!task) throw new Error(`embedding task 缓存冲突后未找到任务: ${cacheKey}`);
  return { task, article, inputText, inputHash, embeddingVersion };
}

export function embeddingJobId(taskId: string) {
  return `embedding-${taskId}`;
}

export async function enqueueEmbeddingTask(
  db: WorkerDb,
  articleId: string,
  enqueue: (payload: EmbeddingJobPayload, jobId: string) => Promise<void>,
  config: EmbeddingConfig = loadEmbeddingConfig(),
) {
  const handle = await createOrGetEmbeddingTask(db, articleId, config);
  if (!handle) return { status: 'skipped' as const, taskId: undefined };
  if (handle.task.status !== 'success') {
    await enqueue({ version: 1, articleId, embeddingTaskId: handle.task.id }, embeddingJobId(handle.task.id));
  }
  return { status: handle.task.status === 'success' ? 'existing' as const : 'enqueued' as const, taskId: handle.task.id };
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

async function existingEmbedding(db: WorkerDb, task: typeof ai_tasks.$inferSelect) {
  if (!task.article_id || !task.provider || !task.model || !task.input_hash || !task.prompt_version) return undefined;
  return (await db.select().from(article_embeddings).where(and(
    eq(article_embeddings.article_id, task.article_id),
    eq(article_embeddings.provider, task.provider),
    eq(article_embeddings.model, task.model),
    eq(article_embeddings.input_hash, task.input_hash),
    eq(article_embeddings.embedding_version, task.prompt_version),
  )).limit(1))[0];
}

async function persistCached(
  db: WorkerDb,
  task: typeof ai_tasks.$inferSelect,
  now: Date,
) {
  const row = await existingEmbedding(db, task);
  if (!row || !task.article_id) return undefined;
  await db.transaction(async (tx) => {
    await tx.update(articles).set({ processing_status: 'embedded', updated_at: now }).where(eq(articles.id, task.article_id!));
    await tx.update(ai_tasks).set({
      status: 'success',
      result_json: { dimensions: row.dimensions, provider: row.provider, model: row.model, inputHash: row.input_hash },
      error: null,
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
  });
  return row;
}

async function persistSuccess(
  db: WorkerDb,
  task: typeof ai_tasks.$inferSelect,
  output: { vector: number[]; dimensions: number; provider: string; model: string },
  now: Date,
) {
  if (!task.article_id || !task.provider || !task.model || !task.input_hash || !task.prompt_version) {
    throw new Error(`embedding task 缺少可追溯字段: ${task.id}`);
  }
  const articleId = task.article_id;
  const provider = task.provider;
  const model = task.model;
  const inputHash = task.input_hash;
  const embeddingVersion = task.prompt_version;
  if (!output.vector.length || output.dimensions !== output.vector.length || !output.vector.every(Number.isFinite)) {
    throw new Error(`embedding 输出向量非法: ${task.id}`);
  }
  return db.transaction(async (tx) => {
    const embeddingValues: typeof article_embeddings.$inferInsert = {
      article_id: articleId,
      provider,
      model,
      dimensions: output.dimensions,
      embedding: output.vector,
      input_hash: inputHash,
      embedding_version: embeddingVersion,
    };
    const inserted = await tx.insert(article_embeddings).values(embeddingValues).onConflictDoNothing({ target: [
      article_embeddings.article_id,
      article_embeddings.provider,
      article_embeddings.model,
      article_embeddings.input_hash,
      article_embeddings.embedding_version,
    ] }).returning();
    const row = inserted[0] ?? (await tx.select().from(article_embeddings).where(and(
      eq(article_embeddings.article_id, articleId),
      eq(article_embeddings.provider, provider),
      eq(article_embeddings.model, model),
      eq(article_embeddings.input_hash, inputHash),
      eq(article_embeddings.embedding_version, embeddingVersion),
    )).limit(1))[0];
    if (!row) throw new Error(`embedding 唯一冲突后未找到向量: ${task.id}`);
    await tx.update(articles).set({ processing_status: 'embedded', updated_at: now }).where(eq(articles.id, task.article_id!));
    await tx.update(ai_tasks).set({
      status: 'success',
      result_json: { dimensions: row.dimensions, provider: row.provider, model: row.model, inputHash: row.input_hash },
      error: null,
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
    return row;
  });
}

export async function processEmbeddingTask(
  options: EmbeddingPipelineOptions,
  taskId: string,
  attemptNumber: number,
): Promise<EmbeddingProcessResult> {
  const config = options.config ?? loadEmbeddingConfig();
  const provider = options.provider ?? createEmbeddingProvider(config);
  const now = options.now ?? (() => new Date());
  const initial = (await options.db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0];
  if (!initial || initial.task_type !== 'embedding' || !initial.article_id) throw new Error(`embedding task 不存在或类型错误: ${taskId}`);
  const article = await loadArticle(options.db, initial.article_id);
  if (!isEligibleArticle(article) && article.processing_status !== 'embedded') {
    throw new Error(`Article 不满足阶段08完成且可见条件: ${article.id}`);
  }
  const claim = await claimTask(options.db, taskId, attemptNumber, now());
  if (!claim.task || claim.task.status === 'success') {
    const cached = await existingEmbedding(options.db, initial);
    return { status: 'cached', articleId: initial.article_id, taskId, dimensions: cached?.dimensions ?? undefined, providerCalled: false };
  }
  if (!claim.acquired) return { status: 'busy', articleId: initial.article_id, taskId, providerCalled: false };

  const cached = await persistCached(options.db, claim.task, now());
  if (cached) {
    await enqueueClusterTask(options.db, initial.article_id, options.enqueueCluster, cached);
    return { status: 'cached', articleId: initial.article_id, taskId, dimensions: cached.dimensions ?? undefined, providerCalled: false };
  }
  const inputText = normalizedEmbeddingInput(article);
  if (!inputText) throw new Error(`Article 缺少规范化中文标题或摘要: ${article.id}`);
  const output = await provider.embed({ text: inputText, model: claim.task.model ?? config.model });
  const row = await persistSuccess(options.db, claim.task, output, now());
  await enqueueClusterTask(options.db, initial.article_id, options.enqueueCluster, row);
  return { status: 'processed', articleId: initial.article_id, taskId, dimensions: row.dimensions ?? undefined, providerCalled: true };
}

async function enqueueClusterTask(
  db: WorkerDb,
  articleId: string,
  enqueue: (payload: ClusterJobPayload, jobId: string) => Promise<void>,
  embedding: typeof article_embeddings.$inferSelect,
) {
  const cacheKey = [
    `article:${articleId}`,
    'task_type:event-cluster',
    `embedding:${embedding.id}`,
    `embedding_version:${embedding.embedding_version}`,
  ].join('|');
  const inserted = await db.insert(ai_tasks).values({
    task_type: 'event-cluster',
    article_id: articleId,
    status: 'pending',
    prompt_version: embedding.embedding_version,
    model: embedding.model,
    provider: embedding.provider,
    input_hash: embedding.input_hash,
    cache_key: cacheKey,
  }).onConflictDoNothing({ target: ai_tasks.cache_key }).returning({ id: ai_tasks.id, status: ai_tasks.status });
  const task = inserted[0] ?? (await db.select({ id: ai_tasks.id, status: ai_tasks.status }).from(ai_tasks).where(eq(ai_tasks.cache_key, cacheKey)).limit(1))[0];
  if (!task) throw new Error(`cluster task 缓存冲突后未找到任务: ${cacheKey}`);
  if (task.status !== 'success') await enqueue({ version: 1, articleId, clusterTaskId: task.id }, `cluster-${task.id}`);
}

export function embeddingTaskError(error: unknown) {
  if (error && typeof error === 'object' && 'kind' in error) {
    const providerError = error as { kind?: string; retryable?: boolean; message?: string };
    return {
      retryable: providerError.retryable ?? false,
      message: (providerError.message ?? String(error)).slice(0, 2_000),
    };
  }
  return { retryable: false, message: `embedding: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000) };
}

export type EmbeddingTransaction = WorkerTransaction;
