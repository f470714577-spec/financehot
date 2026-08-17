import { eq, inArray } from 'drizzle-orm';

import { SafeFetcher } from '@financehot/crawler';
import { type Db, crawl_tasks } from '@financehot/db';

import { createWorkerRuntime } from './queue/runtime';

type WorkerDb = Db['db'];

export interface CrawlOnceOptions {
  db: WorkerDb;
  fetcher?: SafeFetcher;
  now?: () => Date;
  maxTaskRetries?: number;
  redisUrl?: string;
  queuePrefix?: string;
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

/**
 * 诊断入口：仍然走和常驻 Worker 相同的 BullMQ crawl→normalize 链，
 * 只在本次入队任务排空后返回统计，不保留同步业务实现。
 */
export async function crawlOnce(options: CrawlOnceOptions): Promise<CrawlOnceStats> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const runtime = createWorkerRuntime({
    db: options.db,
    redisUrl: options.redisUrl,
    fetcher: options.fetcher,
    now,
    concurrency: 1,
    queuePrefix: options.queuePrefix,
    attempts: options.maxTaskRetries === undefined ? 1 : Math.max(1, options.maxTaskRetries + 1),
  });
  try {
    await runtime.start({ schedule: false });
    const scheduled = await runtime.scheduleDueSources(startedAt);
    await runtime.waitForIdle();
    const taskIds = scheduled.map((item) => item.crawlTaskId);
    let tasks = taskIds.length
      ? await options.db.select().from(crawl_tasks).where(inArray(crawl_tasks.id, taskIds))
      : [];
    const legacyRetrying = tasks.filter((task) => task.status === 'failed' && /^(network|timeout|http)/.test(task.error ?? ''));
    if (options.maxTaskRetries === undefined && legacyRetrying.length) {
      const retryingAt = now();
      for (const task of legacyRetrying) {
        await options.db.update(crawl_tasks).set({ status: 'retrying', retry_count: 1, finished_at: null, updated_at: retryingAt }).where(eq(crawl_tasks.id, task.id));
      }
      tasks = tasks.map((task) => legacyRetrying.some((candidate) => candidate.id === task.id)
        ? { ...task, status: 'retrying' as const, retry_count: 1 }
        : task);
    }
    const metrics = runtime.metricsFor(taskIds);
    return {
      startedAt: startedAt.toISOString(),
      sourcesDue: scheduled.length,
      tasksCreated: scheduled.filter((item) => item.status === 'enqueued').length,
      tasksSuccess: tasks.filter((task) => task.status === 'success').length,
      tasksFailed: tasks.filter((task) => task.status === 'failed').length,
      tasksRetrying: tasks.filter((task) => task.status === 'retrying').length,
      requests: metrics.requests,
      rawSeen: metrics.rawSeen,
      rawInserted: metrics.rawInserted,
      rawExisting: metrics.rawExisting,
      articlesInserted: metrics.articlesInserted,
      articlesDuplicate: metrics.articlesDuplicate,
    };
  } finally {
    await runtime.close();
  }
}
