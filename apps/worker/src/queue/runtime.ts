import { Queue, UnrecoverableError, Worker, type Job, type JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { and, eq, or } from 'drizzle-orm';

import { SafeFetcher } from '@financehot/crawler';
import { createEmbeddingProvider, createLLMProvider, loadEmbeddingConfig, loadLLMConfig, type EmbeddingConfig, type EmbeddingProvider, type LLMConfig, type LLMProvider } from '@financehot/ai';
import { ai_tasks, type Db, crawl_tasks, sources } from '@financehot/db';
import {
  IMPLEMENTED_JOB_NAMES,
  isImplementedJobName,
  jobNameSchema,
  parseJobPayload,
  type CrawlJobPayload,
  type ClusterJobPayload,
  type AiProcessJobPayload,
  type EmbeddingJobPayload,
  type ImplementedJobName,
  type JobName,
  type NormalizeJobPayload,
} from '@financehot/shared';

import { logger } from '../logger';
import { defaultJobOptions, getWorkerConfig } from '../config/worker-config';
import { crawlJobId, normalizeJobId, scheduledSlot, unsupportedJobMessage } from './ids';
import { dueSources, errorDetails, crawlSource, emptyMetrics, normalizeRawRows, type PipelineMetrics } from './pipeline';
import { SourceLock } from './source-lock';
import { aiErrorDetails, enqueueAiTask, processAiTask } from '../ai-pipeline';
import { embeddingTaskError, processEmbeddingTask } from '../embedding-pipeline';
import { clusterTaskError, processClusterTask } from '../cluster-pipeline';

type WorkerDb = Db['db'];

export interface WorkerRuntimeOptions {
  db: WorkerDb;
  redisUrl?: string;
  fetcher?: SafeFetcher;
  now?: () => Date;
  queuePrefix?: string;
  concurrency?: number;
  attempts?: number;
  backoffDelayMs?: number;
  schedulerIntervalMs?: number;
  drainTimeoutMs?: number;
  lockDurationMs?: number;
  stalledIntervalMs?: number;
  llmConfig?: LLMConfig;
  llmProvider?: LLMProvider;
  embeddingConfig?: EmbeddingConfig;
  embeddingProvider?: EmbeddingProvider;
  clusterSimilarityThreshold?: number;
  clusterTimeWindowHours?: number;
}

interface RuntimeConfig {
  queuePrefix: string;
  concurrency: number;
  attempts: number;
  backoffDelayMs: number;
  schedulerIntervalMs: number;
  drainTimeoutMs: number;
  lockTtlMs: number;
  lockDurationMs: number;
  stalledIntervalMs: number;
  clusterSimilarityThreshold: number;
  clusterTimeWindowHours: number;
}

export interface ScheduledCrawl {
  sourceId: string;
  crawlTaskId: string;
  scheduledAt: Date;
  jobId: string;
  status: 'enqueued' | 'duplicate' | 'existing';
}

export interface RuntimeMetrics extends PipelineMetrics {
  taskIds: string[];
}

function runtimeConfig(options: WorkerRuntimeOptions): RuntimeConfig {
  const defaults = getWorkerConfig();
  return {
    queuePrefix: options.queuePrefix ?? defaults.queuePrefix,
    concurrency: options.concurrency ?? defaults.concurrency,
    attempts: options.attempts ?? defaults.attempts,
    backoffDelayMs: options.backoffDelayMs ?? defaults.backoff.delay,
    schedulerIntervalMs: options.schedulerIntervalMs ?? defaults.schedulerIntervalMs,
    drainTimeoutMs: options.drainTimeoutMs ?? defaults.idleTimeoutMs,
    lockTtlMs: defaults.lockTtlMs,
    lockDurationMs: options.lockDurationMs ?? 30_000,
    stalledIntervalMs: options.stalledIntervalMs ?? 1_000,
    clusterSimilarityThreshold: options.clusterSimilarityThreshold ?? defaults.clusterSimilarityThreshold,
    clusterTimeWindowHours: options.clusterTimeWindowHours ?? defaults.clusterTimeWindowHours,
  };
}

function jobOptions(config: RuntimeConfig): JobsOptions {
  return {
    ...defaultJobOptions(),
    attempts: config.attempts,
    backoff: { type: 'exponential', delay: config.backoffDelayMs },
  };
}

function jobIdOf(job: Job) {
  return String(job.id ?? 'unknown');
}

function mergeMetrics(target: RuntimeMetrics, value: PipelineMetrics) {
  target.requests += value.requests;
  target.rawSeen += value.rawSeen;
  target.rawInserted += value.rawInserted;
  target.rawExisting += value.rawExisting;
  target.articlesInserted += value.articlesInserted;
  target.articlesDuplicate += value.articlesDuplicate;
  target.articleIds.push(...value.articleIds);
  target.newArticleIds.push(...value.newArticleIds);
}

export class WorkerRuntime {
  readonly config: RuntimeConfig;
  private readonly db: WorkerDb;
  private readonly fetcher: SafeFetcher;
  private readonly now: () => Date;
  private readonly queues = new Map<ImplementedJobName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly workerConnections: Redis[] = [];
  private readonly queueConnections: Redis[] = [];
  private readonly metrics = new Map<string, RuntimeMetrics>();
  private readonly baseRedis: Redis;
  private readonly lock: SourceLock;
  readonly llmConfig: LLMConfig;
  readonly llmProvider: LLMProvider;
  readonly embeddingConfig: EmbeddingConfig;
  readonly embeddingProvider: EmbeddingProvider;
  private scheduler?: ReturnType<typeof setInterval>;
  private accepting = true;
  private started = false;

  constructor(options: WorkerRuntimeOptions) {
    this.config = runtimeConfig(options);
    this.db = options.db;
    this.fetcher = options.fetcher ?? new SafeFetcher({ minIntervalMs: 1_000 });
    this.now = options.now ?? (() => new Date());
    this.llmConfig = options.llmConfig ?? loadLLMConfig();
    this.llmProvider = options.llmProvider ?? createLLMProvider(this.llmConfig);
    this.embeddingConfig = options.embeddingConfig ?? loadEmbeddingConfig();
    this.embeddingProvider = options.embeddingProvider ?? createEmbeddingProvider(this.embeddingConfig);
    this.baseRedis = new Redis(options.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    this.lock = new SourceLock(this.baseRedis, this.config.queuePrefix, this.config.lockTtlMs);
  }

  async start(options: { schedule?: boolean } = {}): Promise<void> {
    if (this.started) return;
    await this.baseRedis.ping();
    for (const name of IMPLEMENTED_JOB_NAMES) {
      const queueConnection = this.baseRedis.duplicate();
      this.queueConnections.push(queueConnection);
      this.queues.set(name, new Queue(name, { connection: queueConnection, prefix: this.config.queuePrefix }));
    }
    for (const name of IMPLEMENTED_JOB_NAMES) {
      const workerConnection = this.baseRedis.duplicate();
      this.workerConnections.push(workerConnection);
      const worker = new Worker(
        name,
        (job) => this.process(job, name),
        {
          connection: workerConnection,
          prefix: this.config.queuePrefix,
          concurrency: this.config.concurrency,
          lockDuration: this.config.lockDurationMs,
          stalledInterval: this.config.stalledIntervalMs,
          maxStalledCount: 2,
        },
      );
      worker.on('error', (error) => logger.error(`[queue=${name}] Worker error`, error));
      worker.on('failed', (job, error) => {
        if (job) logger.error(`[job_id=${jobIdOf(job)}] [queue=${name}] job failed`, error.message);
      });
      this.workers.push(worker);
    }
    this.started = true;
    if (options.schedule !== false) {
      await this.scheduleDueSources();
      this.scheduler = setInterval(() => {
        void this.scheduleDueSources().catch((error) => logger.error('调度器失败', error));
      }, this.config.schedulerIntervalMs);
    }
  }

  private queue(name: ImplementedJobName): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue 尚未启动: ${name}`);
    return queue;
  }

  getQueue(name: ImplementedJobName): Queue {
    return this.queue(name);
  }

  private metricFor(taskId: string): RuntimeMetrics {
    const current = this.metrics.get(taskId);
    if (current) return current;
    const created: RuntimeMetrics = { ...emptyMetrics(), taskIds: [taskId] };
    this.metrics.set(taskId, created);
    return created;
  }

  private async markRunning(taskId: string, retryCount: number) {
    const now = this.now();
    const existing = await this.db.select({ retryCount: crawl_tasks.retry_count }).from(crawl_tasks).where(eq(crawl_tasks.id, taskId)).limit(1);
    await this.db.update(crawl_tasks).set({
      status: 'running',
      retry_count: Math.max(existing[0]?.retryCount ?? 0, retryCount),
      error: null,
      started_at: now,
      finished_at: null,
      updated_at: now,
    }).where(eq(crawl_tasks.id, taskId));
  }

  private async markResult(taskId: string, status: 'success' | 'failed' | 'retrying', retryCount: number, error?: string) {
    const now = this.now();
    const existing = await this.db.select({ retryCount: crawl_tasks.retry_count }).from(crawl_tasks).where(eq(crawl_tasks.id, taskId)).limit(1);
    await this.db.update(crawl_tasks).set({
      status,
      retry_count: Math.max(existing[0]?.retryCount ?? 0, retryCount),
      error: error ?? null,
      finished_at: status === 'retrying' ? null : now,
      updated_at: now,
    }).where(eq(crawl_tasks.id, taskId));
  }

  private async process(job: Job, queueName: ImplementedJobName) {
    const parsedName = jobNameSchema.parse(job.name);
    if (!isImplementedJobName(parsedName)) throw new Error(unsupportedJobMessage(parsedName));
    const payload = parseJobPayload(parsedName, job.data);
    const taskId = 'crawlTaskId' in payload ? payload.crawlTaskId : undefined;
    const attemptNumber = job.attemptsMade + 1;
    if (taskId) await this.markRunning(taskId, job.attemptsMade);
    const jobId = jobIdOf(job);
    const sourceId = 'sourceId' in payload ? payload.sourceId : 'none';
    const metrics = taskId ? this.metricFor(taskId) : undefined;
    logger.info(`[job_id=${jobId} source_id=${sourceId}] ${queueName} attempt=${attemptNumber} started`);
    try {
      if (queueName === 'crawl') {
        const result = await crawlSource(
          this.db,
          payload as CrawlJobPayload,
          this.fetcher,
          this.now(),
          async (nextPayload, nextJobId) => {
            parseJobPayload('normalize', nextPayload);
            await this.queue('normalize').add('normalize', nextPayload, { ...jobOptions(this.config), jobId: nextJobId });
          },
          normalizeJobId,
          metrics ?? emptyMetrics(),
        );
        logger.info(`[job_id=${jobId} source_id=${sourceId}] crawl raw_count=${result.rawIds.length} normalize_job_id=${result.normalizeJobId ?? 'none'}`);
        if (taskId && result.rawIds.length === 0) {
          await this.markResult(taskId, 'success', job.attemptsMade);
          await this.lock.release(sourceId, jobId);
        }
        return result;
      }
      if (queueName === 'ai_process') {
        const result = await processAiTask({
          db: this.db,
          config: this.llmConfig,
          provider: this.llmProvider,
          now: this.now,
          enqueue: async (nextPayload, nextJobId) => {
            parseJobPayload('ai_process', nextPayload);
            await this.queue('ai_process').add('ai_process', nextPayload, { ...jobOptions(this.config), jobId: nextJobId });
          },
          embeddingConfig: this.embeddingConfig,
          enqueueEmbedding: async (nextPayload, nextJobId) => {
            parseJobPayload('embedding', nextPayload);
            await this.queue('embedding').add('embedding', nextPayload, { ...jobOptions(this.config), jobId: nextJobId });
          },
        }, (payload as AiProcessJobPayload).aiTaskId, attemptNumber);
        logger.info(`[job_id=${jobId}] [article_id=${result.articleId}] ai_process task_type=${result.taskType} status=${result.status}`);
        return result;
      }
      if (queueName === 'embedding') {
        const result = await processEmbeddingTask({
          db: this.db,
          config: this.embeddingConfig,
          provider: this.embeddingProvider,
          now: this.now,
          enqueueCluster: async (nextPayload, nextJobId) => {
            parseJobPayload('cluster', nextPayload);
            await this.queue('cluster').add('cluster', nextPayload, { ...jobOptions(this.config), jobId: nextJobId });
          },
        }, (payload as EmbeddingJobPayload).embeddingTaskId, attemptNumber);
        logger.info(`[job_id=${jobId}] [article_id=${result.articleId}] embedding status=${result.status} provider_called=${result.providerCalled}`);
        return result;
      }
      if (queueName === 'cluster') {
        const result = await processClusterTask({
          db: this.db,
          now: this.now,
          similarityThreshold: this.config.clusterSimilarityThreshold,
          timeWindowHours: this.config.clusterTimeWindowHours,
        }, (payload as ClusterJobPayload).clusterTaskId, attemptNumber);
        logger.info(`[job_id=${jobId}] [article_id=${result.articleId}] cluster status=${result.status} event_id=${result.eventId ?? 'none'}`);
        return result;
      }
      const normalizePayload = payload as NormalizeJobPayload;
      const result = await normalizeRawRows(this.db, await this.loadSource(normalizePayload.sourceId), normalizePayload.rawIds, this.now());
      if (metrics) mergeMetrics(metrics, result);
      for (const articleId of result.articleIds) {
        logger.info(`[job_id=${jobId} source_id=${sourceId} raw_id=${normalizePayload.rawIds.join(',')} article_id=${articleId}] normalize persisted`);
      }
      for (const articleId of result.newArticleIds) {
        await enqueueAiTask(this.db, articleId, 'financial-filter', async (nextPayload, nextJobId) => {
          parseJobPayload('ai_process', nextPayload);
          await this.queue('ai_process').add('ai_process', nextPayload, { ...jobOptions(this.config), jobId: nextJobId });
        }, this.llmConfig);
      }
      await this.markResult(normalizePayload.crawlTaskId, 'success', job.attemptsMade);
      await this.lock.release(sourceId, normalizePayload.crawlJobId);
      logger.info(`[job_id=${jobId} source_id=${sourceId} raw_id=${normalizePayload.rawIds.join(',')} article_id=${result.articleIds.join(',') || 'none'}] normalize completed`);
      return result;
    } catch (error) {
      const details = errorDetails(error);
      if (queueName === 'ai_process') {
        const aiDetails = aiErrorDetails(error);
        const canRetry = aiDetails.retryable && attemptNumber < this.config.attempts;
        await this.db.update(ai_tasks).set({
          status: canRetry ? 'retrying' : 'failed',
          retry_count: attemptNumber,
          error: aiDetails.message,
          updated_at: this.now(),
        }).where(eq(ai_tasks.id, (payload as { aiTaskId: string }).aiTaskId));
        logger.error(`[job_id=${jobId}] ai_process ${canRetry ? 'retrying' : 'failed'} retry_count=${attemptNumber}`, aiDetails.message);
        if (!canRetry && !aiDetails.retryable) throw new UnrecoverableError(aiDetails.message);
        throw error;
      }
      if (queueName === 'embedding' || queueName === 'cluster') {
        const stage09TaskId = queueName === 'embedding'
          ? (payload as EmbeddingJobPayload).embeddingTaskId
          : (payload as ClusterJobPayload).clusterTaskId;
        const stage09Details = queueName === 'embedding' ? embeddingTaskError(error) : clusterTaskError(error);
        const canRetry = stage09Details.retryable && attemptNumber < this.config.attempts;
        await this.db.update(ai_tasks).set({
          status: canRetry ? 'retrying' : 'failed',
          retry_count: attemptNumber,
          error: stage09Details.message,
          updated_at: this.now(),
        }).where(eq(ai_tasks.id, stage09TaskId));
        logger.error(`[job_id=${jobId}] ${queueName} ${canRetry ? 'retrying' : 'failed'} retry_count=${attemptNumber}`, stage09Details.message);
        if (!canRetry && !stage09Details.retryable) throw new UnrecoverableError(stage09Details.message);
        throw error;
      }
      const canRetry = details.retryable && attemptNumber < this.config.attempts;
      if (taskId) await this.markResult(taskId, canRetry ? 'retrying' : 'failed', attemptNumber, details.message);
      if (!canRetry) await this.lock.release(sourceId, queueName === 'normalize' ? (payload as NormalizeJobPayload).crawlJobId : jobId);
      logger.error(`[job_id=${jobId} source_id=${sourceId}] ${queueName} ${canRetry ? 'retrying' : 'failed'} retry_count=${attemptNumber}`, details.message);
      if (!canRetry && !details.retryable) throw new UnrecoverableError(details.message);
      throw error;
    }
  }

  private async loadSource(sourceId: string) {
    const rows = await this.db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
    if (!rows[0]) throw new Error(`source 不存在: ${sourceId}`);
    return rows[0];
  }

  private async createOrGetTask(sourceId: string, scheduledAt: Date) {
    const created = await this.db.insert(crawl_tasks).values({
      source_id: sourceId,
      status: 'pending',
      scheduled_at: scheduledAt,
    }).onConflictDoNothing().returning({ id: crawl_tasks.id });
    if (created[0]) return created[0].id;
    const existing = await this.db.select({ id: crawl_tasks.id, status: crawl_tasks.status })
      .from(crawl_tasks)
      .where(and(eq(crawl_tasks.source_id, sourceId), eq(crawl_tasks.scheduled_at, scheduledAt)))
      .limit(1);
    if (!existing[0]) throw new Error('crawl_task 冲突后未找到任务');
    return existing[0].id;
  }

  private async taskStatus(taskId: string) {
    const rows = await this.db.select({ status: crawl_tasks.status }).from(crawl_tasks).where(eq(crawl_tasks.id, taskId)).limit(1);
    return rows[0]?.status;
  }

  private async findTask(sourceId: string, scheduledAt?: Date) {
    const conditions = scheduledAt
      ? and(eq(crawl_tasks.source_id, sourceId), eq(crawl_tasks.scheduled_at, scheduledAt))
      : and(
        eq(crawl_tasks.source_id, sourceId),
        or(eq(crawl_tasks.status, 'pending'), eq(crawl_tasks.status, 'running'), eq(crawl_tasks.status, 'retrying')),
      );
    const rows = await this.db
      .select({ id: crawl_tasks.id, status: crawl_tasks.status })
      .from(crawl_tasks)
      .where(conditions)
      .limit(1);
    return rows[0];
  }

  private async findTaskAfterLockConflict(sourceId: string, scheduledAt: Date) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const exact = await this.findTask(sourceId, scheduledAt);
      if (exact) return exact;
      const active = await this.findTask(sourceId);
      if (active) return active;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return undefined;
  }

  async enqueueCrawl(sourceId: string, scheduledAt: Date): Promise<ScheduledCrawl> {
    if (!this.accepting) throw new Error('Worker 正在关闭，不再接收新任务');
    const jobId = crawlJobId(sourceId, scheduledAt);
    if (!(await this.lock.tryAcquire(sourceId, jobId))) {
      const task = await this.findTaskAfterLockConflict(sourceId, scheduledAt);
      if (!task) throw new Error(`source 锁冲突但未找到对应 crawl_task: ${sourceId}`);
      return { sourceId, crawlTaskId: task.id, scheduledAt, jobId, status: 'duplicate' };
    }
    try {
      const taskId = await this.createOrGetTask(sourceId, scheduledAt);
      const status = await this.taskStatus(taskId);
      if (status === 'success' || status === 'failed') {
        await this.lock.release(sourceId, jobId);
        return { sourceId, crawlTaskId: taskId, scheduledAt, jobId, status: 'existing' };
      }
      const payload: CrawlJobPayload = { version: 1, sourceId, crawlTaskId: taskId, scheduledAt: scheduledAt.toISOString() };
      parseJobPayload('crawl', payload);
      await this.queue('crawl').add('crawl', payload, { ...jobOptions(this.config), jobId });
      logger.info(`[job_id=${jobId} source_id=${sourceId}] crawl enqueued task_id=${taskId}`);
      return { sourceId, crawlTaskId: taskId, scheduledAt, jobId, status: status === 'pending' ? 'enqueued' : 'existing' };
    } catch (error) {
      await this.lock.release(sourceId, jobId);
      throw error;
    }
  }

  async scheduleDueSources(now = this.now(), sourceIds?: readonly string[]): Promise<ScheduledCrawl[]> {
    if (!this.started) throw new Error('Worker 尚未启动');
    if (!this.accepting) return [];
    const allowed = sourceIds ? new Set(sourceIds) : undefined;
    const due = (await dueSources(this.db, now)).filter((source) => !allowed || allowed.has(source.id));
    const result: ScheduledCrawl[] = [];
    for (const source of due) {
      const scheduledAt = scheduledSlot(now, source.crawl_interval ?? 3_600);
      result.push(await this.enqueueCrawl(source.id, scheduledAt));
    }
    return result;
  }

  async enqueueJob(name: JobName | string, payload: unknown, options: { jobId?: string } = {}) {
    const parsedName = jobNameSchema.parse(name);
    if (!isImplementedJobName(parsedName)) throw new Error(unsupportedJobMessage(parsedName));
    const parsedPayload = parseJobPayload(parsedName, payload);
    if (parsedName === 'ai_process' || parsedName === 'embedding' || parsedName === 'cluster') {
      const stage09Payload = parsedPayload as AiProcessJobPayload & Partial<EmbeddingJobPayload & ClusterJobPayload>;
      const taskId = parsedName === 'ai_process'
        ? stage09Payload.aiTaskId
        : parsedName === 'embedding' ? stage09Payload.embeddingTaskId : stage09Payload.clusterTaskId;
      if (!taskId) throw new Error(`${parsedName} payload 缺少 task id`);
      const expectedType = parsedName === 'ai_process' ? undefined : parsedName === 'embedding' ? 'embedding' : 'event-cluster';
      const task = await this.db.select({ id: ai_tasks.id, articleId: ai_tasks.article_id, taskType: ai_tasks.task_type })
        .from(ai_tasks)
        .where(eq(ai_tasks.id, taskId))
        .limit(1);
      if (!task[0] || task[0].articleId !== stage09Payload.articleId || (expectedType && task[0].taskType !== expectedType)) {
        throw new Error(`${parsedName} task 不存在、类型或 article_id 不匹配: ${taskId}`);
      }
    }
    const jobId = options.jobId ?? `${parsedName}-${Date.now()}`;
    return this.queue(parsedName).add(parsedName, parsedPayload, { ...jobOptions(this.config), jobId });
  }

  async getJob(name: ImplementedJobName, jobId: string) {
    return this.queue(name).getJob(jobId);
  }

  async pause(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.pause(true)));
  }

  async waitForIdle(timeoutMs = this.config.drainTimeoutMs): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const counts = await Promise.all([...this.queues.values()].map((queue) => queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized')));
      const busy = counts.some((count) => (count.waiting ?? 0) + (count.active ?? 0) + (count.delayed ?? 0) + (count.prioritized ?? 0) > 0);
      if (!busy) return;
      await new Promise((resolve) => setTimeout(resolve, getWorkerConfig().idlePollMs));
    }
    throw new Error(`等待队列排空超时: ${timeoutMs}ms`);
  }

  metricsFor(taskIds: string[]): RuntimeMetrics {
    const result: RuntimeMetrics = { ...emptyMetrics(), taskIds: [...taskIds] };
    for (const taskId of taskIds) {
      const value = this.metrics.get(taskId);
      if (value) mergeMetrics(result, value);
    }
    return result;
  }

  stopAccepting() {
    this.accepting = false;
    if (this.scheduler) clearInterval(this.scheduler);
    this.scheduler = undefined;
  }

  async close(options: { drain?: boolean; force?: boolean } = {}): Promise<void> {
    this.stopAccepting();
    if (options.drain !== false && this.started) {
      await this.waitForIdle(this.config.drainTimeoutMs).catch((error) => logger.error('优雅排空超时，继续关闭 Worker', error));
    }
    await Promise.all(this.workers.map((worker) => worker.close(options.force === true)));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await Promise.all(this.workerConnections.map((connection) => connection.quit().catch(() => undefined)));
    await Promise.all(this.queueConnections.map((connection) => connection.quit().catch(() => undefined)));
    await this.baseRedis.quit().catch(() => undefined);
    this.workers.length = 0;
    this.queues.clear();
    this.started = false;
  }
}

export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntime {
  return new WorkerRuntime(options);
}
