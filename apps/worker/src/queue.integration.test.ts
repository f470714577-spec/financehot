import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

import Redis from 'ioredis';
import { eq, inArray } from 'drizzle-orm';

import { CrawlerError, SafeFetcher, type RawHttpResponse } from '@financehot/crawler';
import { articles, createDb, crawl_tasks, raw_articles, sources } from '@financehot/db';
import { parseJobPayload, type JobName } from '@financehot/shared';

import { createWorkerRuntime, type WorkerRuntime } from './queue/runtime';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = createDb(databaseUrl);
const suitePrefix = `stage07-it-${process.pid}-${Date.now()}`;
let testNumber = 0;

const wait = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function fixtureXml(key: string, values: { title?: string; url?: string; description?: string } = {}) {
  const title = values.title ?? `Queue fixture ${key}`;
  const url = values.url ?? `https://fixture.example/article/${key}`;
  const description = values.description ?? `Queue fixture excerpt ${key}`;
  return `<?xml version="1.0"?><rss version="2.0"><channel><item><title>${title}</title><link>${url}</link><description>${description}</description><pubDate>Mon, 17 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
}

function response(body: string): RawHttpResponse {
  return { status: 200, headers: { 'content-type': 'application/rss+xml' }, body: new TextEncoder().encode(body) };
}

function fixtureFetcher(body: string | (() => string), behavior?: (call: number) => Error | undefined, delayMs = 0) {
  let calls = 0;
  const fetcher = new SafeFetcher({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => {
      calls += 1;
      if (delayMs) await wait(delayMs);
      const error = behavior?.(calls);
      if (error) throw error;
      return response(typeof body === 'function' ? body() : body);
    },
    sleep: async (ms) => { if (ms) await wait(Math.min(ms, 5)); },
    defaultMaxAttempts: 1,
    minIntervalMs: 0,
  });
  return { fetcher, calls: () => calls };
}

async function cleanupQueuePrefix(prefix: string) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200);
      cursor = result[0];
      if (result[1].length) await redis.del(...result[1]);
    } while (cursor !== '0');
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

async function cleanupFixtures(sourceIds: string[]) {
  if (!sourceIds.length) return;
  await connection.db.delete(raw_articles).where(inArray(raw_articles.source_id, sourceIds));
  await connection.db.delete(crawl_tasks).where(inArray(crawl_tasks.source_id, sourceIds));
  await connection.db.delete(articles).where(inArray(articles.source_id, sourceIds));
  await connection.db.delete(sources).where(inArray(sources.id, sourceIds));
}

async function withRuntime<T>(
  name: string,
  options: { fetcher?: SafeFetcher; attempts?: number; backoffDelayMs?: number; concurrency?: number } = {},
  callback: (runtime: WorkerRuntime, createSource: (values?: Partial<typeof sources.$inferInsert>) => Promise<typeof sources.$inferSelect>) => Promise<T>,
): Promise<T> {
  const prefix = `${suitePrefix}-${++testNumber}-${name}`;
  const sourceIds: string[] = [];
  const runtime = createWorkerRuntime({
    db: connection.db,
    redisUrl,
    fetcher: options.fetcher,
    queuePrefix: prefix,
    attempts: options.attempts ?? 3,
    backoffDelayMs: options.backoffDelayMs ?? 10,
    concurrency: options.concurrency ?? 2,
    drainTimeoutMs: 10_000,
  });
  const createSource = async (values: Partial<typeof sources.$inferInsert> = {}) => {
    const rows = await connection.db.insert(sources).values({
      name: `${prefix}-${sourceIds.length}`,
      type: 'rss',
      country: 'US',
      language: 'en',
      source_level: 'E',
      enabled: true,
      crawl_interval: 1,
      adapter_config: { kind: 'rss', feedUrl: 'https://fixture.example/feed.xml' },
      ...values,
    }).returning();
    sourceIds.push(rows[0].id);
    return rows[0];
  };
  try {
    await runtime.start({ schedule: false });
    return await callback(runtime, createSource);
  } finally {
    await runtime.close({ drain: true });
    await cleanupFixtures(sourceIds);
    await cleanupQueuePrefix(prefix);
  }
}

async function taskById(id: string) {
  const rows = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.id, id)).limit(1);
  assert.ok(rows[0], `找不到 crawl_task ${id}`);
  return rows[0];
}

async function waitForTaskStatus(id: string, status: typeof crawl_tasks.$inferSelect.status) {
  for (let index = 0; index < 100; index += 1) {
    const task = await taskById(id);
    if (task.status === status) return task;
    await wait(10);
  }
  throw new Error(`任务 ${id} 未进入 ${status}`);
}

async function enqueueAndDrain(runtime: WorkerRuntime, sourceId: string, scheduledAt: string) {
  const scheduled = await runtime.enqueueCrawl(sourceId, new Date(scheduledAt));
  await runtime.waitForIdle();
  return { scheduled, task: await taskById(scheduled.crawlTaskId) };
}

describe('阶段07真实 Redis + PostgreSQL BullMQ 集成', { concurrency: false }, () => {
  before(async () => {
    await connection.db.execute('select 1');
    const redis = new Redis(redisUrl);
    assert.equal(await redis.ping(), 'PONG');
    await redis.quit();
  });

  after(async () => {
    await connection.pool.end();
  });

  test('job 契约带版本并校验关联 ID', () => {
    const sourceId = randomUUID();
    const crawlTaskId = randomUUID();
    const payload = parseJobPayload('crawl', { version: 1, sourceId, crawlTaskId, scheduledAt: '2026-08-17T00:00:00.000Z' });
    assert.equal(payload.version, 1);
    assert.throws(() => parseJobPayload('crawl', { ...payload, version: 2 }));
    assert.throws(() => parseJobPayload('crawl', { ...payload, sourceId: 'not-a-uuid' }));
  });

  test('source 入队后真实完成 crawl→Raw pending→normalize→Article', async () => {
    const fixture = fixtureFetcher(fixtureXml('chain'));
    await withRuntime('chain', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const { scheduled, task } = await enqueueAndDrain(runtime, source.id, '2026-08-17T01:00:00.000Z');
      const raw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id));
      const article = await connection.db.select().from(articles).where(eq(articles.source_id, source.id));
      assert.equal(task.status, 'success');
      assert.equal(raw.length, 1);
      assert.equal(raw[0].processing_status, 'normalized');
      assert.equal(raw[0].article_id, article[0].id);
      assert.equal(article.length, 1);
      assert.equal(fixture.calls(), 1);
      assert.equal(await (await runtime.getJob('crawl', scheduled.jobId))?.getState(), 'completed');
    });
  });

  test('同一 source 同一 scheduledAt 重复投递只有一个确定性 job', async () => {
    const fixture = fixtureFetcher(fixtureXml('duplicate-submit'));
    await withRuntime('duplicate-submit', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const scheduledAt = new Date('2026-08-17T02:00:00.000Z');
      const results = await Promise.all([
        runtime.enqueueCrawl(source.id, scheduledAt),
        runtime.enqueueCrawl(source.id, scheduledAt),
        runtime.enqueueCrawl(source.id, scheduledAt),
      ]);
      await runtime.waitForIdle();
      const tasks = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.source_id, source.id));
      const raw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id));
      const article = await connection.db.select().from(articles).where(eq(articles.source_id, source.id));
      assert.equal(new Set(results.map((result) => result.jobId)).size, 1);
      assert.equal(tasks.length, 1);
      assert.equal(raw.length, 1);
      assert.equal(article.length, 1);
      assert.equal(fixture.calls(), 1);
    });
  });

  test('同 source 并发投递由 Redis 分布式锁去重', async () => {
    const fixture = fixtureFetcher(fixtureXml('same-source-lock'), undefined, 80);
    await withRuntime('same-source-lock', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const scheduledAt = new Date('2026-08-17T03:00:00.000Z');
      const results = await Promise.all(Array.from({ length: 6 }, () => runtime.enqueueCrawl(source.id, scheduledAt)));
      await runtime.waitForIdle();
      assert.equal(results.filter((result) => result.status === 'enqueued').length, 1);
      assert.equal(results.filter((result) => result.status === 'duplicate').length, 5);
      assert.equal(fixture.calls(), 1);
    });
  });

  test('同一输入三次只保留一个 Raw 和一个 Article', async () => {
    const fixture = fixtureFetcher(fixtureXml('three-round'));
    await withRuntime('three-round', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      await enqueueAndDrain(runtime, source.id, '2026-08-17T04:00:00.000Z');
      await enqueueAndDrain(runtime, source.id, '2026-08-17T04:00:02.000Z');
      await enqueueAndDrain(runtime, source.id, '2026-08-17T04:00:04.000Z');
      const raw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id));
      const article = await connection.db.select().from(articles).where(eq(articles.source_id, source.id));
      assert.equal(raw.length, 1);
      assert.equal(raw[0].processing_status, 'duplicate');
      assert.equal(article.length, 1);
      assert.equal(fixture.calls(), 3);
    });
  });

  test('canonical_url 跨 source 去重', async () => {
    const body = fixtureXml('canonical', { url: 'https://fixture.example/shared-canonical' });
    const fixture = fixtureFetcher(body);
    await withRuntime('canonical', { fetcher: fixture.fetcher, concurrency: 1 }, async (runtime, createSource) => {
      const first = await createSource();
      const second = await createSource();
      await enqueueAndDrain(runtime, first.id, '2026-08-17T05:00:00.000Z');
      await enqueueAndDrain(runtime, second.id, '2026-08-17T05:00:01.000Z');
      const secondRaw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, second.id));
      assert.equal(secondRaw[0].processing_status, 'duplicate');
      assert.ok(secondRaw[0].duplicate_of_article_id);
    });
  });

  test('content_hash 跨 source 去重', async () => {
    const fixture = fixtureFetcher(() => fixtureXml('content', {
      title: `Different title ${testNumber}`,
      url: `https://fixture.example/content-${testNumber}`,
      description: 'Same normalized content for content-hash test',
    }));
    await withRuntime('content-hash', { fetcher: fixture.fetcher, concurrency: 1 }, async (runtime, createSource) => {
      const first = await createSource();
      const second = await createSource();
      await enqueueAndDrain(runtime, first.id, '2026-08-17T06:00:00.000Z');
      await enqueueAndDrain(runtime, second.id, '2026-08-17T06:00:01.000Z');
      const secondRaw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, second.id));
      assert.equal(secondRaw[0].processing_status, 'duplicate');
    });
  });

  test('title_hash 跨 source 去重', async () => {
    const fixture = fixtureFetcher(() => fixtureXml('title', {
      title: 'Same normalized title for title-hash test',
      url: `https://fixture.example/title-${testNumber}`,
      description: `Different normalized content ${testNumber}`,
    }));
    await withRuntime('title-hash', { fetcher: fixture.fetcher, concurrency: 1 }, async (runtime, createSource) => {
      const first = await createSource();
      const second = await createSource();
      await enqueueAndDrain(runtime, first.id, '2026-08-17T07:00:00.000Z');
      await enqueueAndDrain(runtime, second.id, '2026-08-17T07:00:01.000Z');
      const secondRaw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, second.id));
      assert.equal(secondRaw[0].processing_status, 'duplicate');
    });
  });

  test('短暂 network 失败后 BullMQ 重试成功并同步 retry_count', async () => {
    const fixture = fixtureFetcher(fixtureXml('retry-success'), (call) => call === 1 ? new CrawlerError('temporary', 'network', true) : undefined);
    await withRuntime('retry-success', { fetcher: fixture.fetcher, backoffDelayMs: 10 }, async (runtime, createSource) => {
      const source = await createSource();
      const { scheduled, task } = await enqueueAndDrain(runtime, source.id, '2026-08-17T08:00:00.000Z');
      assert.equal(task.status, 'success');
      assert.equal(task.retry_count, 1);
      assert.equal(fixture.calls(), 2);
      assert.equal(await (await runtime.getJob('crawl', scheduled.jobId))?.getState(), 'completed');
    });
  });

  test('短暂失败期间 DB 可观察到 retrying', async () => {
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolvePromise) => { releaseRetry = resolvePromise; });
    let calls = 0;
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => {
        calls += 1;
        if (calls === 1) throw new CrawlerError('temporary', 'network', true);
        await retryGate;
        return response(fixtureXml('retrying-visible'));
      },
      defaultMaxAttempts: 1,
      sleep: async () => undefined,
      minIntervalMs: 0,
    });
    await withRuntime('retrying-visible', { fetcher, backoffDelayMs: 200 }, async (runtime, createSource) => {
      const source = await createSource();
      const scheduled = await runtime.enqueueCrawl(source.id, new Date('2026-08-17T09:00:00.000Z'));
      await waitForTaskStatus(scheduled.crawlTaskId, 'retrying');
      releaseRetry();
      await runtime.waitForIdle();
      assert.equal((await taskById(scheduled.crawlTaskId)).status, 'success');
    });
  });

  test('耗尽重试同时进入 BullMQ failed set 与 DB failed', async () => {
    const fixture = fixtureFetcher('', () => new CrawlerError('permanent network', 'network', true));
    await withRuntime('retry-exhausted', { fetcher: fixture.fetcher, attempts: 2, backoffDelayMs: 10 }, async (runtime, createSource) => {
      const source = await createSource();
      const { scheduled, task } = await enqueueAndDrain(runtime, source.id, '2026-08-17T10:00:00.000Z');
      const failedJob = await runtime.getJob('crawl', scheduled.jobId);
      const failed = await runtime.getQueue('crawl').getFailed(0, 100);
      assert.equal(task.status, 'failed');
      assert.equal(task.retry_count, 2);
      assert.equal(await failedJob?.getState(), 'failed');
      assert.ok(failed.some((job) => job.id === scheduled.jobId));
      assert.equal(fixture.calls(), 2);
    });
  });

  test('非重试配置错误只执行一次并进入 failed', async () => {
    const fixture = fixtureFetcher(fixtureXml('not-requested'));
    await withRuntime('non-retryable', { fetcher: fixture.fetcher, attempts: 3 }, async (runtime, createSource) => {
      const source = await createSource({ adapter_config: null });
      const { scheduled, task } = await enqueueAndDrain(runtime, source.id, '2026-08-17T11:00:00.000Z');
      assert.equal(task.status, 'failed');
      assert.equal(task.retry_count, 1);
      assert.equal(fixture.calls(), 0);
      assert.equal(await (await runtime.getJob('crawl', scheduled.jobId))?.getState(), 'failed');
    });
  });

  test('未实现 job 被明确拒绝且不创建消费者任务', async () => {
    await withRuntime('unsupported', {}, async (runtime) => {
      await assert.rejects(() => runtime.enqueueJob('ai_process', { version: 1, articleId: randomUUID(), aiTaskId: randomUUID() }));
      assert.equal((await runtime.getQueue('crawl').getJobCounts('waiting', 'active', 'failed')).waiting, 0);
    });
  });

  test('启动调度器按指定到期 source 入 crawl', async () => {
    const fixture = fixtureFetcher(fixtureXml('scheduler'));
    await withRuntime('scheduler', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource({ crawl_interval: 60 });
      const scheduled = await runtime.scheduleDueSources(new Date('2026-08-17T12:00:00.000Z'), [source.id]);
      await runtime.waitForIdle();
      assert.equal(scheduled.length, 1);
      assert.equal((await taskById(scheduled[0].crawlTaskId)).status, 'success');
    });
  });

  test('source 未到 crawl_interval 不重复调度', async () => {
    const fixture = fixtureFetcher(fixtureXml('not-due'));
    await withRuntime('not-due', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource({ crawl_interval: 60 });
      await runtime.scheduleDueSources(new Date('2026-08-17T13:00:00.000Z'), [source.id]);
      await runtime.waitForIdle();
      const second = await runtime.scheduleDueSources(new Date('2026-08-17T13:00:30.000Z'), [source.id]);
      assert.equal(second.length, 0);
    });
  });

  test('BullMQ 保留 completed 记录用于追踪', async () => {
    const fixture = fixtureFetcher(fixtureXml('retention'));
    await withRuntime('retention', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const { scheduled } = await enqueueAndDrain(runtime, source.id, '2026-08-17T14:00:00.000Z');
      const job = await runtime.getJob('crawl', scheduled.jobId);
      assert.ok(job);
      assert.equal(await job.getState(), 'completed');
    });
  });

  test('同一 queue prefix 的两个 Worker 实例共享 source 锁', async () => {
    const prefix = `${suitePrefix}-${++testNumber}-two-workers`;
    const sourceIds: string[] = [];
    const fixture = fixtureFetcher(fixtureXml('two-workers'), undefined, 100);
    const runtimeA = createWorkerRuntime({ db: connection.db, redisUrl, fetcher: fixture.fetcher, queuePrefix: prefix, backoffDelayMs: 10, drainTimeoutMs: 10_000 });
    const runtimeB = createWorkerRuntime({ db: connection.db, redisUrl, fetcher: fixture.fetcher, queuePrefix: prefix, backoffDelayMs: 10, drainTimeoutMs: 10_000 });
    try {
      await runtimeA.start({ schedule: false });
      await runtimeB.start({ schedule: false });
      const rows = await connection.db.insert(sources).values({
        name: `${prefix}-source`, type: 'rss', country: 'US', language: 'en', source_level: 'E', enabled: true, crawl_interval: 1,
        adapter_config: { kind: 'rss', feedUrl: 'https://fixture.example/feed.xml' },
      }).returning();
      sourceIds.push(rows[0].id);
      const time = new Date('2026-08-17T15:00:00.000Z');
      const results = await Promise.all([runtimeA.enqueueCrawl(rows[0].id, time), runtimeB.enqueueCrawl(rows[0].id, time)]);
      await Promise.all([runtimeA.waitForIdle(), runtimeB.waitForIdle()]);
      assert.equal(results.filter((result) => result.status === 'enqueued').length, 1);
      assert.equal(fixture.calls(), 1);
      assert.equal((await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, rows[0].id))).length, 1);
    } finally {
      await runtimeA.close({ drain: true });
      await runtimeB.close({ drain: true });
      await cleanupFixtures(sourceIds);
      await cleanupQueuePrefix(prefix);
    }
  });

  test('新 Worker 可接手旧 Worker 关闭后留下的 waiting job', async () => {
    const prefix = `${suitePrefix}-${++testNumber}-restart`;
    const sourceIds: string[] = [];
    const fixture = fixtureFetcher(fixtureXml('restart'));
    const runtimeA = createWorkerRuntime({ db: connection.db, redisUrl, fetcher: fixture.fetcher, queuePrefix: prefix, drainTimeoutMs: 10_000 });
    const source = await (async () => {
      const rows = await connection.db.insert(sources).values({
        name: `${prefix}-source`, type: 'rss', country: 'US', language: 'en', source_level: 'E', enabled: true, crawl_interval: 1,
        adapter_config: { kind: 'rss', feedUrl: 'https://fixture.example/feed.xml' },
      }).returning();
      sourceIds.push(rows[0].id);
      return rows[0];
    })();
    try {
      await runtimeA.start({ schedule: false });
      await runtimeA.pause();
      const scheduled = await runtimeA.enqueueCrawl(source.id, new Date('2026-08-17T16:00:00.000Z'));
      assert.equal(await (await runtimeA.getJob('crawl', scheduled.jobId))?.getState(), 'waiting');
      await runtimeA.close({ drain: false });
      const runtimeB = createWorkerRuntime({ db: connection.db, redisUrl, fetcher: fixture.fetcher, queuePrefix: prefix, drainTimeoutMs: 10_000 });
      try {
        await runtimeB.start({ schedule: false });
        await runtimeB.waitForIdle();
        assert.equal((await taskById(scheduled.crawlTaskId)).status, 'success');
      } finally {
        await runtimeB.close({ drain: true });
      }
    } finally {
      await runtimeA.close({ drain: false });
      await cleanupFixtures(sourceIds);
      await cleanupQueuePrefix(prefix);
    }
  });

  test('active job 所在 Worker 异常中断后由新 Worker 识别 stalled 并接管', async () => {
    const prefix = `${suitePrefix}-${++testNumber}-stalled-recovery`;
    const sourceIds: string[] = [];
    let signalActive!: () => void;
    const active = new Promise<void>((resolvePromise) => { signalActive = resolvePromise; });
    const hungFetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => {
        signalActive();
        return new Promise<RawHttpResponse>(() => undefined);
      },
      defaultMaxAttempts: 1,
      minIntervalMs: 0,
    });
    const recoveredFixture = fixtureFetcher(fixtureXml('stalled-recovery'));
    const runtimeA = createWorkerRuntime({
      db: connection.db,
      redisUrl,
      fetcher: hungFetcher,
      queuePrefix: prefix,
      lockDurationMs: 300,
      stalledIntervalMs: 100,
      drainTimeoutMs: 10_000,
    });
    const sourceRows = await connection.db.insert(sources).values({
      name: `${prefix}-source`, type: 'rss', country: 'US', language: 'en', source_level: 'E', enabled: true, crawl_interval: 1,
      adapter_config: { kind: 'rss', feedUrl: 'https://fixture.example/feed.xml' },
    }).returning();
    sourceIds.push(sourceRows[0].id);
    try {
      await runtimeA.start({ schedule: false });
      const scheduled = await runtimeA.enqueueCrawl(sourceRows[0].id, new Date('2026-08-17T16:30:00.000Z'));
      await Promise.race([
        active,
        wait(2_000).then(() => { throw new Error('crawl job 未进入 active'); }),
      ]);
      assert.equal(await (await runtimeA.getJob('crawl', scheduled.jobId))?.getState(), 'active');
      assert.equal((await taskById(scheduled.crawlTaskId)).status, 'running');
      await runtimeA.close({ drain: false, force: true });

      const runtimeB = createWorkerRuntime({
        db: connection.db,
        redisUrl,
        fetcher: recoveredFixture.fetcher,
        queuePrefix: prefix,
        lockDurationMs: 300,
        stalledIntervalMs: 100,
        drainTimeoutMs: 10_000,
      });
      try {
        await runtimeB.start({ schedule: false });
        await runtimeB.waitForIdle();
        assert.equal((await taskById(scheduled.crawlTaskId)).status, 'success');
        assert.equal(await (await runtimeB.getJob('crawl', scheduled.jobId))?.getState(), 'completed');
        assert.equal(recoveredFixture.calls(), 1);
      } finally {
        await runtimeB.close({ drain: true });
      }
    } finally {
      await runtimeA.close({ drain: false, force: true });
      await cleanupFixtures(sourceIds);
      await cleanupQueuePrefix(prefix);
    }
  });

  test('graceful shutdown 等待在途 crawl→normalize 完成', async () => {
    const fixture = fixtureFetcher(fixtureXml('graceful'), undefined, 80);
    await withRuntime('graceful', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const scheduled = await runtime.enqueueCrawl(source.id, new Date('2026-08-17T17:00:00.000Z'));
      await runtime.close();
      assert.equal((await taskById(scheduled.crawlTaskId)).status, 'success');
      assert.equal(fixture.calls(), 1);
    });
  });

  test('日志含 job_id/source_id/raw_id/article_id 关联字段', async () => {
    const fixture = fixtureFetcher(fixtureXml('logs'));
    await withRuntime('logs', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const originalLog = console.log;
      const lines: string[] = [];
      console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
      try {
        const source = await createSource();
        await enqueueAndDrain(runtime, source.id, '2026-08-17T18:00:00.000Z');
      } finally {
        console.log = originalLog;
      }
      const joined = lines.join('\n');
      assert.match(joined, /job_id=/);
      assert.match(joined, /source_id=/);
      assert.match(joined, /raw_id=/);
      assert.match(joined, /article_id=/);
    });
  });

  test('停止接收后不再接受新任务', async () => {
    const fixture = fixtureFetcher(fixtureXml('stop-accepting'));
    await withRuntime('stop-accepting', { fetcher: fixture.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      runtime.stopAccepting();
      await assert.rejects(() => runtime.enqueueCrawl(source.id, new Date('2026-08-17T19:00:00.000Z')), /关闭/);
    });
  });

  test('job name 只允许契约集合，未知名称在入队前失败', async () => {
    await withRuntime('unknown-name', {}, async (runtime) => {
      await assert.rejects(() => runtime.enqueueJob('not-a-real-job' as JobName, {}));
    });
  });

  test('空抓取仍完成 task 且不伪造 Article', async () => {
    const empty = fixtureFetcher('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>');
    await withRuntime('empty', { fetcher: empty.fetcher }, async (runtime, createSource) => {
      const source = await createSource();
      const { task } = await enqueueAndDrain(runtime, source.id, '2026-08-17T20:00:00.000Z');
      assert.equal(task.status, 'success');
      assert.equal((await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id))).length, 0);
      assert.equal((await connection.db.select().from(articles).where(eq(articles.source_id, source.id))).length, 0);
    });
  });
});
