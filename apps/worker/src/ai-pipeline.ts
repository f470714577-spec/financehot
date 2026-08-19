import { createHash } from 'node:crypto';

import {
  createLLMProvider,
  estimateCost,
  LLMProviderError,
  loadLLMConfig,
  type LLMConfig,
  type LLMProvider,
  type ProviderAttempt,
  type ProviderErrorKind,
  aiResultSchemas,
  type ClassifyResult,
  type EntityExtractionResult,
  type FinancialFilterResult,
  type SummarizeResult,
  type TranslateResult,
} from '@financehot/ai';
import {
  ai_tasks,
  ai_usage,
  article_categories,
  article_countries,
  articles,
  categories,
  countries,
  raw_articles,
  type Db,
} from '@financehot/db';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { ZodType } from 'zod';
import { getPrompt, type AiPromptTask, type PromptArticle } from '../../../prompts';
import type { AiProcessJobPayload } from '@financehot/shared';

type WorkerDb = Db['db'];
type WorkerTransaction = Parameters<WorkerDb['transaction']>[0] extends (tx: infer Tx) => Promise<unknown> ? Tx : never;

export const AI_TASK_SEQUENCE: readonly AiPromptTask[] = [
  'financial-filter',
  'translate',
  'summarize',
  'classify',
  'entity-extraction',
];

export interface AiPipelineOptions {
  db: WorkerDb;
  provider?: LLMProvider;
  config?: LLMConfig;
  now?: () => Date;
  enqueue: (payload: AiProcessJobPayload, jobId: string) => Promise<void>;
}

export interface AiTaskHandle {
  task: typeof ai_tasks.$inferSelect;
  article: typeof articles.$inferSelect;
  cacheKey: string;
}

export interface AiProcessResult {
  status: 'processed' | 'cached' | 'busy';
  taskType: AiPromptTask;
  articleId: string;
  usageRecorded: boolean;
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

function articlePromptData(article: typeof articles.$inferSelect, rawContent?: string): PromptArticle {
  return {
    originalTitle: article.original_title ?? '',
    originalSummary: article.original_summary ?? '',
    content: rawContent ?? article.original_summary ?? '',
  };
}

function taskInput(taskType: AiPromptTask, article: typeof articles.$inferSelect, rawContent?: string): string {
  const data = articlePromptData(article, rawContent);
  return JSON.stringify({
    taskType,
    originalTitle: data.originalTitle,
    originalSummary: data.originalSummary,
    content: data.content,
    titleZh: article.title_zh ?? '',
    summaryZh: article.summary_zh ?? '',
  });
}

export function aiCacheKey(args: {
  articleId: string;
  taskType: AiPromptTask;
  inputHash: string;
  promptVersion: string;
  provider: string;
  model: string;
}) {
  return [
    `article:${args.articleId}`,
    `task_type:${args.taskType}`,
    `input_hash:${args.inputHash}`,
    `prompt_version:${args.promptVersion}`,
    `provider:${args.provider}`,
    `model:${args.model}`,
  ].join('|');
}

async function loadArticle(db: WorkerDb, articleId: string) {
  const rows = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!rows[0]) throw new Error(`article 不存在: ${articleId}`);
  const rawRows = await db.select({ content: raw_articles.raw_content })
    .from(raw_articles)
    .where(eq(raw_articles.article_id, articleId))
    .limit(1);
  return { article: rows[0], rawContent: rawRows[0]?.content ?? undefined };
}

export async function createOrGetAiTask(
  db: WorkerDb,
  articleId: string,
  taskType: AiPromptTask,
  config: LLMConfig = loadLLMConfig(),
): Promise<AiTaskHandle> {
  const { article, rawContent } = await loadArticle(db, articleId);
  const prompt = getPrompt(taskType);
  const inputHash = digest(taskInput(taskType, article, rawContent));
  const cacheKey = aiCacheKey({
    articleId,
    taskType,
    inputHash,
    promptVersion: prompt.version,
    provider: providerName(config),
    model: modelName(config),
  });
  const inserted = await db.insert(ai_tasks).values({
    task_type: taskType,
    article_id: articleId,
    status: 'pending',
    prompt_version: prompt.version,
    model: modelName(config),
    provider: providerName(config),
    input_hash: inputHash,
    cache_key: cacheKey,
  }).onConflictDoNothing({ target: ai_tasks.cache_key }).returning();
  const task = inserted[0] ?? (await db.select().from(ai_tasks).where(eq(ai_tasks.cache_key, cacheKey)).limit(1))[0];
  if (!task) throw new Error(`ai_task 缓存冲突后未找到任务: ${cacheKey}`);
  return { task, article, cacheKey };
}

export function aiProcessJobId(taskId: string) {
  return `ai-process-${taskId}`;
}

export async function enqueueAiTask(
  db: WorkerDb,
  articleId: string,
  taskType: AiPromptTask,
  enqueue: AiPipelineOptions['enqueue'],
  config: LLMConfig = loadLLMConfig(),
) {
  const handle = await createOrGetAiTask(db, articleId, taskType, config);
  if (handle.task.status !== 'success') {
    const payload: AiProcessJobPayload = { version: 1, articleId, aiTaskId: handle.task.id };
    await enqueue(payload, aiProcessJobId(handle.task.id));
  }
  return handle;
}

async function claimTask(db: WorkerDb, taskId: string, attemptNumber: number, now: Date) {
  const claimed = await db.update(ai_tasks).set({
    status: 'running',
    retry_count: Math.max(0, attemptNumber - 1),
    error: null,
    updated_at: now,
  }).where(and(
    eq(ai_tasks.id, taskId),
    or(eq(ai_tasks.status, 'pending'), eq(ai_tasks.status, 'retrying')),
  )).returning();
  if (claimed[0]) return { task: claimed[0], acquired: true };
  return {
    task: (await db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0],
    acquired: false,
  };
}

async function taxonomyContext(db: WorkerDb, taskType: AiPromptTask) {
  if (taskType === 'classify') {
    const rows = await db.select({ slug: categories.slug, name: categories.name }).from(categories);
    return `允许分类：${rows.map((row) => `${row.slug}=${row.name}`).join(', ')}`;
  }
  if (taskType === 'entity-extraction') {
    const rows = await db.select({ code: countries.code, name: countries.name_en }).from(countries);
    return `允许国家代码：${rows.map((row) => `${row.code}=${row.name}`).join(', ')}`;
  }
  return undefined;
}

function taskError(error: unknown): { message: string; retryable: boolean; kind: ProviderErrorKind | 'unknown' } {
  if (error && typeof error === 'object' && 'kind' in error) {
    const providerError = error as { kind: ProviderErrorKind; retryable?: boolean; message?: string };
    return {
      kind: providerError.kind,
      retryable: providerError.retryable ?? ['rate_limit', 'server', 'timeout', 'network'].includes(providerError.kind),
      message: (providerError.message ?? String(error)).slice(0, 2_000),
    };
  }
  return { kind: 'unknown', retryable: false, message: `ai_process: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000) };
}

export function aiErrorDetails(error: unknown) {
  return taskError(error);
}

async function persistSuccess(
  db: WorkerDb,
  task: typeof ai_tasks.$inferSelect,
  result: Record<string, unknown>,
  attempts: readonly ProviderAttempt[],
  attemptNumber: number,
  config: LLMConfig,
  articleUpdate: (tx: WorkerTransaction) => Promise<void>,
  now: Date,
) {
  await db.transaction(async (tx) => {
    await articleUpdate(tx);
    await tx.update(ai_tasks).set({
      status: 'success',
      result_json: result,
      error: null,
      retry_count: Math.max(task.retry_count, attemptNumber - 1),
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
    await persistProviderAttempts(tx, task, attemptNumber, attempts, config);
  });
}

async function persistProviderAttempts(
  tx: WorkerTransaction,
  task: typeof ai_tasks.$inferSelect,
  attemptNumber: number,
  attempts: readonly ProviderAttempt[],
  config: LLMConfig,
) {
  if (!attempts.length) return;
  await tx.insert(ai_usage).values(attempts.map((providerAttempt) => ({
    ai_task_id: task.id,
    provider: task.provider,
    model: providerAttempt.model || task.model,
    task_type: task.task_type,
    article_id: task.article_id,
    attempt: attemptNumber,
    provider_attempt: providerAttempt.providerAttempt,
    outcome: providerAttempt.outcome,
    http_status: providerAttempt.httpStatus,
    usage_reported: providerAttempt.usageReported,
    prompt_tokens: providerAttempt.usage?.promptTokens ?? 0,
    completion_tokens: providerAttempt.usage?.completionTokens ?? 0,
    estimated_cost: estimateCost(providerAttempt.usage, config),
  }))).onConflictDoNothing({ target: [ai_usage.ai_task_id, ai_usage.attempt, ai_usage.provider_attempt] });
}

async function persistFailure(
  db: WorkerDb,
  task: typeof ai_tasks.$inferSelect,
  attemptNumber: number,
  error: unknown,
  retryable: boolean,
  config: LLMConfig,
  now: Date,
) {
  const details = taskError(error);
  const attempts = error instanceof LLMProviderError ? error.attempts : [];
  await db.transaction(async (tx) => {
    await tx.update(ai_tasks).set({
      status: retryable ? 'retrying' : 'failed',
      retry_count: Math.max(0, attemptNumber),
      error: details.message,
      updated_at: now,
    }).where(eq(ai_tasks.id, task.id));
    await persistProviderAttempts(tx, task, attemptNumber, attempts, config);
  });
}

async function applyResult(
  task: typeof ai_tasks.$inferSelect,
  value: FinancialFilterResult | TranslateResult | SummarizeResult | ClassifyResult | EntityExtractionResult,
  now: Date,
) {
  if (task.task_type === 'financial-filter') {
    const result = value as FinancialFilterResult;
    return (tx: WorkerTransaction) => tx.update(articles).set({
      financial_relevance_score: Math.round(result.score * 100),
      ai_reason: result.reason,
      processing_status: result.isFinancial ? 'financial_filtered' : 'filtered_out',
      is_hidden: result.isFinancial ? false : true,
      updated_at: now,
    }).where(eq(articles.id, task.article_id!)).then(() => undefined);
  }
  if (task.task_type === 'translate') {
    const result = value as TranslateResult;
    return (tx: WorkerTransaction) => tx.update(articles).set({ title_zh: result.titleZh, processing_status: 'translated', updated_at: now }).where(eq(articles.id, task.article_id!)).then(() => undefined);
  }
  if (task.task_type === 'summarize') {
    const result = value as SummarizeResult;
    return (tx: WorkerTransaction) => tx.update(articles).set({ summary_zh: result.summaryZh, ai_reason: result.reason, processing_status: 'summarized', updated_at: now }).where(eq(articles.id, task.article_id!)).then(() => undefined);
  }
  if (task.task_type === 'classify') {
    const result = value as ClassifyResult;
    return async (tx: WorkerTransaction) => {
      const slugs = result.categories.map((item) => item.slug);
      const known = slugs.length ? await tx.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, slugs)) : [];
      for (const item of result.categories) {
        const category = known.find((row) => row.slug === item.slug);
        if (!category) continue;
        await tx.insert(article_categories).values({ article_id: task.article_id!, category_id: category.id, confidence: item.confidence }).onConflictDoNothing();
      }
      await tx.update(articles).set({ processing_status: 'classified', updated_at: now }).where(eq(articles.id, task.article_id!));
    };
  }
  const result = value as EntityExtractionResult;
  return async (tx: WorkerTransaction) => {
    const codes = result.countries.map((item) => item.code);
    const known = codes.length ? await tx.select({ id: countries.id, code: countries.code }).from(countries).where(inArray(countries.code, codes)) : [];
    for (const item of result.countries) {
      const country = known.find((row) => row.code === item.code);
      if (!country) continue;
      await tx.insert(article_countries).values({ article_id: task.article_id!, country_id: country.id, role: item.role }).onConflictDoNothing();
    }
    await tx.update(articles).set({ processing_status: 'entity_extracted', updated_at: now }).where(eq(articles.id, task.article_id!));
  };
}

export async function processAiTask(
  options: AiPipelineOptions,
  taskId: string,
  attemptNumber: number,
): Promise<AiProcessResult> {
  const config = options.config ?? loadLLMConfig();
  const provider = options.provider ?? createLLMProvider(config);
  const now = options.now ?? (() => new Date());
  const initial = (await options.db.select().from(ai_tasks).where(eq(ai_tasks.id, taskId)).limit(1))[0];
  if (!initial || !initial.article_id) throw new Error(`ai_task 不存在或缺少 article_id: ${taskId}`);
  if (!AI_TASK_SEQUENCE.includes(initial.task_type as AiPromptTask)) throw new Error(`阶段08不支持 ai_task 类型: ${initial.task_type}`);
  const claim = await claimTask(options.db, taskId, attemptNumber, now());
  if (!claim.task || claim.task.status === 'success') return { status: 'cached', taskType: initial.task_type as AiPromptTask, articleId: initial.article_id, usageRecorded: false };
  if (!claim.acquired) return { status: 'busy', taskType: initial.task_type as AiPromptTask, articleId: initial.article_id, usageRecorded: false };

  const { article, rawContent } = await loadArticle(options.db, initial.article_id);
  const taskType = initial.task_type as AiPromptTask;
  const prompt = getPrompt(taskType);
  const schema = aiResultSchemas[taskType] as unknown as ZodType<Record<string, unknown>>;
  try {
    const output = await provider.generateJSONWithUsage<Record<string, unknown>>({
      system: prompt.system,
      prompt: prompt.buildUserPrompt(articlePromptData(article, rawContent), await taxonomyContext(options.db, taskType)),
      schema,
      model: initial.model ?? provider.model,
      temperature: 0,
    });
    const articleUpdate = await applyResult(initial, output.value as Record<string, unknown> as FinancialFilterResult, now());
    await persistSuccess(options.db, initial, output.value as Record<string, unknown>, output.attempts, attemptNumber, config, articleUpdate, now());
    if (taskType === 'financial-filter' && (output.value as FinancialFilterResult).isFinancial) {
      await enqueueAiTask(options.db, initial.article_id, 'translate', options.enqueue, config);
    } else if (taskType === 'translate') {
      await enqueueAiTask(options.db, initial.article_id, 'summarize', options.enqueue, config);
    } else if (taskType === 'summarize') {
      await enqueueAiTask(options.db, initial.article_id, 'classify', options.enqueue, config);
    } else if (taskType === 'classify') {
      await enqueueAiTask(options.db, initial.article_id, 'entity-extraction', options.enqueue, config);
    }
    return { status: 'processed', taskType, articleId: initial.article_id, usageRecorded: true };
  } catch (error) {
    const details = taskError(error);
    await persistFailure(options.db, initial, attemptNumber, error, details.retryable, config, now());
    throw error;
  }
}
