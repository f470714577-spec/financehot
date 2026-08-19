import { createHash } from 'node:crypto';

import {
  ai_tasks,
  ai_usage,
  article_categories,
  article_countries,
  article_embeddings,
  articles,
  categories,
  countries,
  event_articles,
  events,
} from '@financehot/db';
import {
  estimateCost,
  eventClusterSchema,
  isLLMConfigured,
  loadLLMConfig,
  LLMProviderError,
  type EventClusterResult,
  type LLMConfig,
  type LLMProvider,
  type ProviderAttempt,
} from '@financehot/ai';
import { and, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { getPrompt, type PromptArticle } from '../../../prompts';

import { clusterDefaults } from './config/worker-config';
import { embeddingInputHash } from './embedding-pipeline';
import { recomputeEventFacts, type WorkerDb, type WorkerTransaction } from './event-facts';

type WorkerQuery = WorkerDb | WorkerTransaction;

const EVENT_CLUSTER_PROMPT = getPrompt('event-cluster');
const CLUSTER_TRANSACTION_LOCK_KEY = 90209;
const ACTION_MARKERS = [
  '收购', '并购', '回购', '裁员', '召回', '起诉', '诉讼', '任命', '辞任', '上调指引', '下调指引', '加息', '降息',
  '发行', '财报', '盈利', '融资', '上市', '停产', '制裁', '批准', '调查', '投资', '涨价', '降价', '签署', '谈判', '分红', '派息', '出售', '破产',
  'acquire', 'acquisition', 'merger', 'buyback', 'recall', 'appoint', 'resign', 'lawsuit', 'guidance', 'earnings',
  'profit', 'funding', 'launch', 'sanction', 'approve', 'investigation', 'investment', 'dividend', 'sell', 'bankrupt', 'rate hike', 'rate cut',
];

export interface ClusterPipelineOptions {
  db: WorkerDb;
  now?: () => Date;
  similarityThreshold?: number;
  directMergeThreshold?: number;
  titleFeatureThreshold?: number;
  llmMinConfidence?: number;
  timeWindowHours?: number;
  llmConfig?: LLMConfig;
  llmProvider?: LLMProvider;
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

function normalizeThreshold(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function normalizeHours(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : clusterDefaults.timeWindowHours;
}

async function claimTask(db: WorkerDb, taskId: string, attemptNumber: number, now: Date) {
  const claimableStatuses = attemptNumber > 1
    ? or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying'), and(eq(ai_tasks.status, 'running'), lt(ai_tasks.retry_count, attemptNumber)))
    : or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying'));
  const claimed = await db.update(ai_tasks).set({ status: 'running', retry_count: Math.max(0, attemptNumber - 1), error: null, updated_at: now })
    .where(and(eq(ai_tasks.id, taskId), claimableStatuses)).returning();
  if (claimed[0]) return { task: claimed[0], acquired: true };
  return { task: (await db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0], acquired: false };
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
  const rows = await db.select({ articleId: article_categories.article_id, slug: categories.slug }).from(article_categories)
    .innerJoin(categories, eq(categories.id, article_categories.category_id)).where(inArray(article_categories.article_id, articleIds));
  const result = new Map<string, Set<string>>();
  for (const row of rows) result.set(row.articleId, new Set([...(result.get(row.articleId) ?? []), row.slug]));
  return result;
}

async function articleCountries(db: WorkerQuery, articleIds: string[]) {
  if (!articleIds.length) return new Map<string, Set<string>>();
  const rows = await db.select({ articleId: article_countries.article_id, code: countries.code }).from(article_countries)
    .innerJoin(countries, eq(countries.id, article_countries.country_id)).where(inArray(article_countries.article_id, articleIds));
  const result = new Map<string, Set<string>>();
  for (const row of rows) result.set(row.articleId, new Set([...(result.get(row.articleId) ?? []), row.code]));
  return result;
}

function categoriesCompatible(current: Set<string>, candidate: Set<string>) {
  if (!current.size || !candidate.size) return true;
  for (const slug of current) if (candidate.has(slug)) return true;
  return false;
}

function entitiesCompatible(current: Set<string>, candidate: Set<string>) {
  if (!current.size || !candidate.size) return true;
  for (const value of current) if (candidate.has(value)) return true;
  return false;
}

function titleTokens(value: string) {
  return new Set((value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9.-]{1,}|[\u4e00-\u9fff]{2,}/g) ?? []).filter((token) => token.length > 1));
}

function titleFeatureScore(current: string, candidate: string) {
  const currentTokens = titleTokens(current);
  const candidateTokens = titleTokens(candidate);
  if (!currentTokens.size || !candidateTokens.size) return 0;
  let intersection = 0;
  for (const token of currentTokens) if (candidateTokens.has(token)) intersection += 1;
  return intersection / (currentTokens.size + candidateTokens.size - intersection);
}

function actionTokens(value: string) {
  const normalized = value.toLocaleLowerCase();
  return new Set(ACTION_MARKERS.filter((marker) => normalized.includes(marker.toLocaleLowerCase())));
}

function titleActionsConflict(current: string, candidate: string) {
  const currentActions = actionTokens(current);
  const candidateActions = actionTokens(candidate);
  if (!currentActions.size || !candidateActions.size) return false;
  for (const marker of currentActions) if (candidateActions.has(marker)) return false;
  return true;
}

interface CandidateFact {
  articleId: string;
  title: string;
  summary: string;
  publishedAt: string;
  categories: string[];
  countries: string[];
}

interface Candidate {
  eventId: string;
  similarity: number;
  memberIds: string[];
  titleFeatureScore: number;
  facts: CandidateFact[];
  kind: 'direct' | 'boundary';
}

async function findCandidate(
  db: WorkerQuery,
  article: typeof articles.$inferSelect,
  embedding: typeof article_embeddings.$inferSelect,
  options: Required<Pick<ClusterPipelineOptions, 'similarityThreshold' | 'directMergeThreshold' | 'titleFeatureThreshold' | 'timeWindowHours'>>,
): Promise<Candidate | undefined> {
  const vectorLiteral = JSON.stringify(embedding.embedding);
  const similarity = sql<number>`1 - (${article_embeddings.embedding} <=> ${vectorLiteral}::vector)`;
  const currentTime = seenAt(article).getTime();
  const windowMs = options.timeWindowHours * 60 * 60 * 1_000;
  const minTime = new Date(currentTime - windowMs);
  const maxTime = new Date(currentTime + windowMs);
  const rows = await db.select({
    eventId: event_articles.event_id,
    memberId: event_articles.article_id,
    memberPublishedAt: articles.published_at,
    memberFetchedAt: articles.fetched_at,
    memberCreatedAt: articles.created_at,
    memberTitleZh: articles.title_zh,
    memberOriginalTitle: articles.original_title,
    memberSummaryZh: articles.summary_zh,
    memberOriginalSummary: articles.original_summary,
    inputHash: article_embeddings.input_hash,
    similarity,
  }).from(event_articles).innerJoin(articles, eq(articles.id, event_articles.article_id)).innerJoin(article_embeddings, eq(article_embeddings.article_id, event_articles.article_id))
    .where(and(
      ne(event_articles.article_id, article.id),
      eq(articles.is_hidden, false),
      eq(article_embeddings.provider, embedding.provider),
      eq(article_embeddings.model, embedding.model),
      eq(article_embeddings.dimensions, embedding.dimensions),
      eq(article_embeddings.embedding_version, embedding.embedding_version),
      sql`coalesce(${articles.published_at}, ${articles.fetched_at}, ${articles.created_at}) >= ${minTime}`,
      sql`coalesce(${articles.published_at}, ${articles.fetched_at}, ${articles.created_at}) <= ${maxTime}`,
    ));
  const byEvent = new Map<string, { similarity: number; rows: typeof rows }>();
  for (const row of rows) {
    const memberInputHash = embeddingInputHash({ title_zh: row.memberTitleZh, summary_zh: row.memberSummaryZh });
    const score = Number(row.similarity);
    if (!memberInputHash || memberInputHash !== row.inputHash || !Number.isFinite(score) || score < options.similarityThreshold) continue;
    const current = byEvent.get(row.eventId);
    if (current) {
      current.rows.push(row);
      current.similarity = Math.max(current.similarity, score);
    } else {
      byEvent.set(row.eventId, { similarity: score, rows: [row] });
    }
  }
  if (!byEvent.size) return undefined;
  const currentCategories = (await articleCategories(db, [article.id])).get(article.id) ?? new Set<string>();
  const currentCountries = (await articleCountries(db, [article.id])).get(article.id) ?? new Set<string>();
  const candidates: Candidate[] = [];
  for (const [eventId, grouped] of byEvent) {
    const memberIds = grouped.rows.map((row) => row.memberId);
    const categoryRows = await articleCategories(db, memberIds);
    const countryRows = await articleCountries(db, memberIds);
    const candidateCategories = new Set(grouped.rows.flatMap((row) => [...(categoryRows.get(row.memberId) ?? [])]));
    const candidateCountries = new Set(grouped.rows.flatMap((row) => [...(countryRows.get(row.memberId) ?? [])]));
    if (!categoriesCompatible(currentCategories, candidateCategories) || !entitiesCompatible(currentCountries, candidateCountries)) continue;
    const titleScores = grouped.rows.map((row) => titleFeatureScore(article.title_zh ?? article.original_title ?? '', row.memberTitleZh ?? row.memberOriginalTitle ?? ''));
    if (grouped.rows.some((row) => titleActionsConflict(article.title_zh ?? article.original_title ?? '', row.memberTitleZh ?? row.memberOriginalTitle ?? ''))) continue;
    const score = Math.max(...titleScores, 0);
    candidates.push({
      eventId,
      similarity: grouped.similarity,
      memberIds,
      titleFeatureScore: score,
      kind: grouped.similarity >= options.directMergeThreshold && score >= options.titleFeatureThreshold ? 'direct' : 'boundary',
      facts: grouped.rows.map((row) => ({
        articleId: row.memberId,
        title: row.memberTitleZh ?? row.memberOriginalTitle ?? '',
        summary: row.memberSummaryZh ?? row.memberOriginalSummary ?? '',
        publishedAt: (row.memberPublishedAt ?? row.memberFetchedAt ?? row.memberCreatedAt).toISOString(),
        categories: [...(categoryRows.get(row.memberId) ?? [])],
        countries: [...(countryRows.get(row.memberId) ?? [])],
      })),
    });
  }
  candidates.sort((left, right) => right.similarity - left.similarity || right.titleFeatureScore - left.titleFeatureScore || left.eventId.localeCompare(right.eventId));
  return candidates[0];
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function providerName(config: LLMConfig) {
  return config.provider ?? 'unconfigured';
}

function modelName(config: LLMConfig) {
  return config.model ?? 'unconfigured';
}

export function eventClusterCacheKey(args: { articleId: string; eventId: string; inputHash: string; promptVersion: string; provider: string; model: string }) {
  return [`article:${args.articleId}`, `event:${args.eventId}`, 'task_type:event-cluster', `input_hash:${args.inputHash}`, `prompt_version:${args.promptVersion}`, `provider:${args.provider}`, `model:${args.model}`].join('|');
}

function eventClusterInput(article: typeof articles.$inferSelect, candidate: Candidate) {
  return JSON.stringify({
    article: { title: article.title_zh ?? article.original_title ?? '', summary: article.summary_zh ?? article.original_summary ?? '', seenAt: seenAt(article).toISOString() },
    candidate: { eventId: candidate.eventId, facts: candidate.facts },
  });
}

async function persistProviderAttempts(tx: WorkerTransaction, task: typeof ai_tasks.$inferSelect, attemptNumber: number, attempts: readonly ProviderAttempt[], config: LLMConfig) {
  if (!attempts.length) return;
  await tx.insert(ai_usage).values(attempts.map((attempt) => ({
    ai_task_id: task.id,
    provider: task.provider,
    model: attempt.model || task.model,
    task_type: task.task_type,
    article_id: task.article_id,
    attempt: attemptNumber,
    provider_attempt: attempt.providerAttempt,
    outcome: attempt.outcome,
    http_status: attempt.httpStatus,
    usage_reported: attempt.usageReported,
    prompt_tokens: attempt.usage?.promptTokens ?? 0,
    completion_tokens: attempt.usage?.completionTokens ?? 0,
    estimated_cost: estimateCost(attempt.usage, config),
  }))).onConflictDoNothing({ target: [ai_usage.ai_task_id, ai_usage.attempt, ai_usage.provider_attempt] });
}

async function getOrCreateDecisionTask(db: WorkerDb, article: typeof articles.$inferSelect, candidate: Candidate, config: LLMConfig) {
  const inputHash = digest(eventClusterInput(article, candidate));
  const cacheKey = eventClusterCacheKey({ articleId: article.id, eventId: candidate.eventId, inputHash, promptVersion: EVENT_CLUSTER_PROMPT.version, provider: providerName(config), model: modelName(config) });
  const inserted = await db.insert(ai_tasks).values({
    task_type: 'event-cluster', article_id: article.id, event_id: candidate.eventId, status: 'pending', prompt_version: EVENT_CLUSTER_PROMPT.version,
    model: modelName(config), provider: providerName(config), input_hash: inputHash, cache_key: cacheKey,
  }).onConflictDoNothing({ target: ai_tasks.cache_key }).returning();
  return inserted[0] ?? (await db.select().from(ai_tasks).where(eq(ai_tasks.cache_key, cacheKey)).limit(1))[0];
}

async function decideBoundary(db: WorkerDb, article: typeof articles.$inferSelect, candidate: Candidate, config: LLMConfig, provider: LLMProvider, attemptNumber: number, now: Date): Promise<{ decision?: EventClusterResult; cached: boolean }> {
  if (!isLLMConfigured(config)) return { cached: false };
  const task = await getOrCreateDecisionTask(db, article, candidate, config);
  if (!task) throw new Error(`event-cluster task 创建失败: ${article.id}`);
  if (task.status === 'success') {
    const parsed = eventClusterSchema.safeParse(task.result_json);
    return { decision: parsed.success ? parsed.data : undefined, cached: true };
  }
  if (task.status === 'failed') return { cached: true };
  const claimed = await db.update(ai_tasks).set({ status: 'running', updated_at: now }).where(and(eq(ai_tasks.id, task.id), or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying')))).returning();
  if (!claimed[0]) {
    const current = (await db.select().from(ai_tasks).where(eq(ai_tasks.id, task.id)).limit(1))[0];
    const parsed = eventClusterSchema.safeParse(current?.result_json);
    return { decision: current?.status === 'success' && parsed.success ? parsed.data : undefined, cached: true };
  }
  const promptArticle: PromptArticle = {
    originalTitle: article.title_zh ?? article.original_title ?? '',
    originalSummary: article.summary_zh ?? article.original_summary ?? '',
    content: `${article.title_zh ?? article.original_title ?? ''}\n${article.summary_zh ?? article.original_summary ?? ''}`,
  };
  try {
    const output = await provider.generateJSONWithUsage<EventClusterResult>({
      system: EVENT_CLUSTER_PROMPT.system,
      prompt: EVENT_CLUSTER_PROMPT.buildUserPrompt(promptArticle, JSON.stringify({ eventId: candidate.eventId, articles: candidate.facts })),
      schema: eventClusterSchema,
      model: task.model ?? provider.model,
      temperature: 0,
    });
    await db.transaction(async (tx) => {
      await tx.update(ai_tasks).set({ status: 'success', result_json: output.value, error: null, retry_count: Math.max(task.retry_count, attemptNumber - 1), updated_at: now }).where(eq(ai_tasks.id, task.id));
      await persistProviderAttempts(tx, task, attemptNumber, output.attempts, config);
    });
    return { decision: output.value, cached: false };
  } catch (error) {
    const message = `event-cluster: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000);
    const attempts = error instanceof LLMProviderError ? error.attempts : [];
    await db.transaction(async (tx) => {
      await tx.update(ai_tasks).set({ status: 'failed', error: message, retry_count: attemptNumber, updated_at: now }).where(eq(ai_tasks.id, task.id));
      await persistProviderAttempts(tx, task, attemptNumber, attempts, config);
    });
    return { cached: false };
  }
}

interface PersistDecision {
  eventId?: string;
  similarity: number;
  confidence: number;
  clusterMethod: 'embedding' | 'llm';
  title?: string;
  summary?: string | null;
}

async function persistCluster(tx: WorkerTransaction, task: typeof ai_tasks.$inferSelect, article: typeof articles.$inferSelect, decision: PersistDecision, now: Date) {
  if (!task.article_id) throw new Error(`cluster task 缺少 article_id: ${task.id}`);
  const existingRelation = (await tx.select({ eventId: event_articles.event_id }).from(event_articles).where(eq(event_articles.article_id, task.article_id)).limit(1))[0];
  if (existingRelation) {
    await tx.update(articles).set({ processing_status: 'clustered', updated_at: now }).where(eq(articles.id, task.article_id));
    await tx.update(ai_tasks).set({ status: 'success', result_json: { eventId: existingRelation.eventId, similarity: 1, cached: true }, error: null, updated_at: now }).where(eq(ai_tasks.id, task.id));
    await recomputeEventFacts(tx, existingRelation.eventId, now);
    return { eventId: existingRelation.eventId, similarity: 1, cached: true };
  }
  let eventId = decision.eventId;
  if (!eventId) {
    const insertedEvent = (await tx.insert(events).values({ title: article.title_zh ?? article.original_title ?? article.canonical_url, summary: article.summary_zh ?? article.original_summary, first_seen_at: seenAt(article), last_seen_at: seenAt(article), article_count: 0, source_count: 0, status: 'developing' }).returning({ id: events.id }))[0];
    if (!insertedEvent) throw new Error(`创建 Event 失败: ${article.id}`);
    eventId = insertedEvent.id;
  }
  await tx.insert(event_articles).values({ event_id: eventId, article_id: task.article_id, is_primary: false, similarity_score: decision.similarity, confidence: decision.confidence, cluster_method: decision.clusterMethod }).onConflictDoNothing();
  await tx.update(articles).set({ processing_status: 'clustered', updated_at: now }).where(eq(articles.id, task.article_id));
  await tx.update(ai_tasks).set({ status: 'success', result_json: { eventId, similarity: decision.similarity, confidence: decision.confidence, clusterMethod: decision.clusterMethod, cached: false }, error: null, updated_at: now }).where(eq(ai_tasks.id, task.id));
  await recomputeEventFacts(tx, eventId, now, { title: decision.title, summary: decision.summary });
  return { eventId, similarity: decision.similarity, cached: false };
}

export async function processClusterTask(options: ClusterPipelineOptions, taskId: string, attemptNumber: number): Promise<ClusterProcessResult> {
  const now = options.now ?? (() => new Date());
  const initial = (await options.db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0];
  if (!initial || initial.task_type !== 'event-cluster' || !initial.article_id) throw new Error(`cluster task 不存在或类型错误: ${taskId}`);
  if (initial.status === 'success') {
    const result = initial.result_json;
    return { status: 'cached', articleId: initial.article_id, taskId, eventId: typeof result?.eventId === 'string' ? result.eventId : undefined };
  }
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
  const candidateOptions = {
    similarityThreshold: normalizeThreshold(options.similarityThreshold, clusterDefaults.similarityThreshold),
    directMergeThreshold: normalizeThreshold(options.directMergeThreshold, clusterDefaults.directMergeThreshold),
    titleFeatureThreshold: normalizeThreshold(options.titleFeatureThreshold, clusterDefaults.titleFeatureThreshold),
    timeWindowHours: normalizeHours(options.timeWindowHours),
  };
  const firstPass = await options.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLUSTER_TRANSACTION_LOCK_KEY})`);
    const candidate = await findCandidate(tx, article, embedding, candidateOptions);
    if (candidate?.kind === 'boundary') return { candidate };
    const decision: PersistDecision = { similarity: candidate?.similarity ?? 1, confidence: candidate?.similarity ?? 1, clusterMethod: 'embedding', eventId: candidate?.eventId };
    return { candidate, result: await persistCluster(tx, claim.task!, article, decision, now()) };
  });
  if (firstPass.result) {
    return { status: firstPass.result.cached ? 'cached' : 'processed', articleId: initial.article_id, taskId, eventId: firstPass.result.eventId, similarity: firstPass.result.similarity };
  }
  const candidate = firstPass.candidate!;
  let decision: PersistDecision = { similarity: candidate.similarity, confidence: candidate.similarity, clusterMethod: 'embedding' };
  {
    const config = options.llmConfig ?? loadLLMConfig();
    const boundary = options.llmProvider ? await decideBoundary(options.db, article, candidate, config, options.llmProvider, attemptNumber, now()) : { cached: false };
    if (boundary.decision?.decision === 'merge' && boundary.decision.confidence >= normalizeThreshold(options.llmMinConfidence, clusterDefaults.llmMinConfidence)) {
      decision = { eventId: candidate.eventId, similarity: candidate.similarity, confidence: boundary.decision.confidence, clusterMethod: 'llm', title: boundary.decision.title, summary: boundary.decision.summary };
    }
  }
  const result = await options.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLUSTER_TRANSACTION_LOCK_KEY})`);
    return persistCluster(tx, claim.task!, article, decision, now());
  });
  return { status: result.cached ? 'cached' : 'processed', articleId: initial.article_id, taskId, eventId: result.eventId, similarity: result.similarity };
}

export function clusterTaskError(error: unknown) {
  return { retryable: false, message: `cluster: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000) };
}

export const clusterDefaultsForPipeline = {
  similarityThreshold: clusterDefaults.similarityThreshold,
  directMergeThreshold: clusterDefaults.directMergeThreshold,
  titleFeatureThreshold: clusterDefaults.titleFeatureThreshold,
  llmMinConfidence: clusterDefaults.llmMinConfidence,
  timeWindowHours: clusterDefaults.timeWindowHours,
};
