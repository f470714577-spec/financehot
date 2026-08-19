import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import Redis from 'ioredis';
import {
  OpenAICompatibleProvider,
  OpenAICompatibleEmbeddingProvider,
  type EmbeddingConfig,
  type LLMConfig,
} from '@financehot/ai';
import {
  ai_tasks,
  ai_usage,
  article_categories,
  article_embeddings,
  articles,
  categories,
  createDb,
  event_articles,
  events,
  sources,
} from '@financehot/db';
import { inArray, like } from 'drizzle-orm';

import { createOrGetAiTask } from './ai-pipeline';
import {
  createOrGetEmbeddingTask,
  embeddingCacheKey,
  enqueueEmbeddingTask,
  processEmbeddingTask,
} from './embedding-pipeline';
import { processClusterTask } from './cluster-pipeline';
import { createWorkerRuntime } from './queue/runtime';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const prefixSeed = `stage09-it-${process.pid}-${Date.now()}`;
const createdQueuePrefixes: string[] = [];
let testNumber = 0;
let providerServer: Server | undefined;
let providerUrl = '';
const providerCalls: string[] = [];

function nextQueuePrefix(name: string) {
  const prefix = `${prefixSeed}-${++testNumber}-${name}`;
  createdQueuePrefixes.push(prefix);
  return prefix;
}

function hashEmbeddingInput(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

async function scanRedisKeys(redis: Redis, prefix: string) {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== '0');
  return keys;
}

async function cleanupRedisPrefix(prefix: string) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200);
      cursor = result[0];
      if (result[1].length) await redis.del(...result[1]);
    } while (cursor !== '0');
  } finally {
    await redis.quit();
  }
}

async function assertRedisPrefixEmpty(prefix: string) {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  try {
    const keys = await scanRedisKeys(redis, prefix);
    assert.equal(keys.length, 0, `Redis 测试 prefix 清理后仍有残留: ${prefix} (${keys.length})`);
  } finally {
    await redis.quit();
  }
}

async function cleanupOwnFixture(articleIds: string[], eventTitlePrefix: string, sourceIds: string[], explicitEventIds: string[] = []) {
  const linkedEventRows = articleIds.length
    ? await connection.db.select({ id: event_articles.event_id }).from(event_articles).where(inArray(event_articles.article_id, articleIds))
    : [];
  const titledEventRows = await connection.db.select({ id: events.id }).from(events).where(like(events.title, `${eventTitlePrefix}%`));
  const eventIds = [...new Set([
    ...explicitEventIds,
    ...linkedEventRows.map((row) => row.id),
    ...titledEventRows.map((row) => row.id),
  ])];
  if (articleIds.length) {
    await connection.db.delete(event_articles).where(inArray(event_articles.article_id, articleIds));
    await connection.db.delete(article_embeddings).where(inArray(article_embeddings.article_id, articleIds));
    const taskRows = await connection.db.select({ id: ai_tasks.id }).from(ai_tasks).where(inArray(ai_tasks.article_id, articleIds));
    if (taskRows.length) await connection.db.delete(ai_usage).where(inArray(ai_usage.ai_task_id, taskRows.map((row) => row.id)));
    await connection.db.delete(ai_tasks).where(inArray(ai_tasks.article_id, articleIds));
    await connection.db.delete(article_categories).where(inArray(article_categories.article_id, articleIds));
    await connection.db.delete(articles).where(inArray(articles.id, articleIds));
  }
  if (eventIds.length) await connection.db.delete(events).where(inArray(events.id, eventIds));
  if (sourceIds.length) await connection.db.delete(sources).where(inArray(sources.id, sourceIds));
}

function vectorFor(marker: string): number[] {
  if (marker.includes('A1')) return [1, 0, 0];
  if (marker.includes('A2')) return [0.99, 0.01, 0];
  if (marker.includes('B1')) return [0, 1, 0];
  if (marker.includes('B2')) return [0.01, 0.99, 0];
  if (marker.includes('COMPETE')) return [1, 0, 0];
  if (marker.includes('COMPANY_DIFF')) return [0.99, 0.01, 0];
  if (marker.includes('LOW_SIM')) return [0, 0, 1];
  return [0.2, 0.2, 0.96];
}

async function readBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

const embeddingConfig = (): EmbeddingConfig => ({
  provider: 'openai-compatible',
  baseUrl: providerUrl,
  model: 'controlled-embedding',
  apiKey: 'local-controlled-key',
  embeddingVersion: 'stage09-test-v1',
  timeoutMs: 2_000,
  maxRetries: 0,
  retryDelayMs: 0,
});

before(async () => {
  await connection.db.execute('select 1');
  await new Promise<void>((resolvePromise, reject) => {
    providerServer = createServer(async (request, response) => {
      const body = await readBody(request);
      const parsed = JSON.parse(body) as { input?: string };
      const input = parsed.input ?? '';
      providerCalls.push(input);
      if (!request.url?.endsWith('/embeddings')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          model: 'controlled-llm',
          choices: [{ message: { content: JSON.stringify({ countries: [], markets: [], assets: [], companies: ['Controlled Corp'], people: [], tickerCandidates: [] }) } }],
        }));
        return;
      }
      if (input.includes('EMBED_FAIL')) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'controlled embedding failure' }));
        return;
      }
      const marker = ['A1', 'A2', 'B1', 'B2', 'COMPETE', 'COMPANY_DIFF', 'LOW_SIM'].find((value) => input.includes(value)) ?? '';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'controlled-embedding', data: [{ index: 0, embedding: vectorFor(marker) }] }));
    });
    providerServer.once('error', reject);
    providerServer.listen(0, '127.0.0.1', () => {
      const address = providerServer?.address();
      if (!address || typeof address === 'string') return reject(new Error('受控 Embedding Provider 未取得端口'));
      providerUrl = `http://127.0.0.1:${address.port}/v1`;
      resolvePromise();
    });
  });
});

after(async () => {
  await new Promise<void>((resolvePromise) => {
    if (!providerServer) {
      resolvePromise();
      return;
    }
    providerServer.closeAllConnections();
    providerServer.close(() => resolvePromise());
  });
  await connection.pool.end();
});

test('真实 Redis/PostgreSQL 受控 Embedding 完成保守事件聚类、失败重试与双 Worker 幂等', async () => {
  const queuePrefix = nextQueuePrefix('main');
  const articleIds: string[] = [];
  const createdEventIds: string[] = [];
  const sourceIds: string[] = [];
  const now = new Date('2026-08-19T08:00:00.000Z');
  const config = embeddingConfig();
  const provider = new OpenAICompatibleEmbeddingProvider(config);
  const llmConfig: LLMConfig = {
    provider: 'openai-compatible',
    baseUrl: providerUrl,
    model: 'controlled-llm',
    apiKey: 'local-controlled-key',
    timeoutMs: 2_000,
    maxRetries: 0,
    retryDelayMs: 0,
  };
  const llmProvider = new OpenAICompatibleProvider(llmConfig);
  const runtimeOne = createWorkerRuntime({ db: connection.db, queuePrefix, concurrency: 1, attempts: 2, backoffDelayMs: 10, embeddingConfig: config, embeddingProvider: provider, llmConfig, llmProvider, now: () => now });
  const runtimeTwo = createWorkerRuntime({ db: connection.db, queuePrefix, concurrency: 1, attempts: 2, backoffDelayMs: 10, embeddingConfig: config, embeddingProvider: provider, llmConfig, llmProvider, now: () => now });
  const fixture = [
    { marker: 'A1', source: 0, category: 'corporate', at: '2026-08-19T00:00:00.000Z' },
    { marker: 'A2', source: 1, category: 'corporate', at: '2026-08-19T01:00:00.000Z' },
    { marker: 'B1', source: 0, category: 'markets', at: '2026-08-19T02:00:00.000Z' },
    { marker: 'B2', source: 1, category: 'markets', at: '2026-08-19T03:00:00.000Z' },
    { marker: 'COMPANY_DIFF', source: 0, category: 'tech', at: '2026-08-19T04:00:00.000Z' },
    { marker: 'LOW_SIM', source: 1, category: 'corporate', at: '2026-08-19T05:00:00.000Z' },
    { marker: 'EMBED_FAIL', source: 0, category: 'corporate', at: '2026-08-19T06:00:00.000Z' },
    { marker: 'COMPETE', source: 1, category: 'corporate', at: '2026-08-19T07:00:00.000Z' },
    { marker: 'CHAIN', source: 0, category: 'corporate', at: '2026-08-19T07:30:00.000Z' },
  ];
  try {
    const sourceRows = await connection.db.insert(sources).values([
      { name: `${queuePrefix}-source-a`, type: 'rss', country: 'US', language: 'zh', source_level: 'E', enabled: false, homepage: 'https://controlled.example' },
      { name: `${queuePrefix}-source-b`, type: 'rss', country: 'GB', language: 'zh', source_level: 'E', enabled: false, homepage: 'https://controlled.example' },
    ]).returning({ id: sources.id });
    sourceIds.push(...sourceRows.map((row) => row.id));
    const categoryRows = await connection.db.select({ id: categories.id, slug: categories.slug }).from(categories);
    const categoryId = (slug: string) => categoryRows.find((row) => row.slug === slug)?.id ?? (() => { throw new Error(`缺少 Seed 分类: ${slug}`); })();
    const articleRows = await connection.db.insert(articles).values(fixture.map((item) => ({
      source_id: sourceRows[item.source].id,
      original_url: `https://controlled.example/stage09/${queuePrefix}/${item.marker}`,
      canonical_url: `https://controlled.example/stage09/${queuePrefix}/${item.marker}`,
      content_hash: `${queuePrefix}-${item.marker}-content`,
      title_hash: `${queuePrefix}-${item.marker}-title`,
      original_title: `Stage09 ${item.marker}`,
      title_zh: `阶段09 ${item.marker}`,
      original_summary: `受控阶段09 ${item.marker} 原始摘要。`,
      summary_zh: `阶段09 ${item.marker} 规范化摘要描述一个可核验的财经事实及其直接影响。`,
      original_language: 'zh',
      published_at: new Date(item.at),
      processing_status: 'entity_extracted' as const,
      is_hidden: false,
    }))).returning({ id: articles.id });
    articleIds.push(...articleRows.map((row) => row.id));
    await connection.db.insert(article_categories).values(fixture.map((item, index) => ({ article_id: articleRows[index].id, category_id: categoryId(item.category), confidence: 0.95 })));

    await runtimeOne.start({ schedule: false });
    await runtimeTwo.start({ schedule: false });
    for (const row of articleRows.slice(0, 7)) {
      await enqueueEmbeddingTask(connection.db, row.id, async (payload, jobId) => { await runtimeOne.enqueueJob('embedding', payload, { jobId }); }, config);
    }
    const competition = await createOrGetEmbeddingTask(connection.db, articleRows[7].id, config);
    assert.ok(competition);
    const competitionPayload = { version: 1 as const, articleId: articleRows[7].id, embeddingTaskId: competition.task.id };
    await runtimeOne.enqueueJob('embedding', competitionPayload, { jobId: 'competition-one' });
    await runtimeTwo.enqueueJob('embedding', competitionPayload, { jobId: 'competition-two' });
    const chainTask = await createOrGetAiTask(connection.db, articleRows[8].id, 'entity-extraction', llmConfig);
    await runtimeOne.enqueueJob('ai_process', { version: 1, articleId: articleRows[8].id, aiTaskId: chainTask.task.id }, { jobId: 'chain-ai-process' });
    await Promise.all([runtimeOne.waitForIdle(30_000), runtimeTwo.waitForIdle(30_000)]);

    const embeddings = await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, articleIds));
    const tasks = await connection.db.select().from(ai_tasks).where(inArray(ai_tasks.article_id, articleIds));
    const links = await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, articleIds));
    const resultArticles = await connection.db.select().from(articles).where(inArray(articles.id, articleIds));
    const linkFor = (index: number) => links.find((link) => link.article_id === articleRows[index].id);
    const aEvent = linkFor(0)?.event_id;
    const bEvent = linkFor(2)?.event_id;
    assert.ok(aEvent && bEvent && aEvent !== bEvent);
    assert.equal(linkFor(1)?.event_id, aEvent, '同事实多信源 A 应归一事件');
    assert.equal(linkFor(3)?.event_id, bEvent, '同事实多信源 B 应归一事件');
    assert.notEqual(linkFor(4)?.event_id, aEvent, '同公司不同事实且分类冲突不得合并');
    assert.notEqual(linkFor(5)?.event_id, aEvent, '低相似不得合并');
    assert.equal(linkFor(7)?.event_id, aEvent, '双 Worker 竞争仍应按相同事实归一');
    assert.equal(embeddings.length, 8, '成功文章各仅一条向量');
    assert.equal(embeddings.every((row) => row.dimensions === 3 && row.provider === config.provider && row.model === config.model && row.embedding_version === config.embeddingVersion), true);
    assert.equal(tasks.filter((task) => task.task_type === 'embedding' && task.status === 'success').length, 8);
    assert.equal(tasks.some((task) => task.id === chainTask.task.id && task.status === 'success'), true, 'ai_process 成功应进入后续 embedding');
    assert.equal(resultArticles.find((article) => article.id === articleRows[8].id)?.processing_status, 'clustered', 'embedding 后应进入 cluster');
    const failed = tasks.find((task) => task.task_type === 'embedding' && task.article_id === articleRows[6].id);
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.retry_count, 2);
    assert.equal(resultArticles.find((article) => article.id === articleRows[6].id)?.processing_status, 'entity_extracted');
    assert.equal(providerCalls.filter((input) => input.includes('EMBED_FAIL')).length, 2, '失败任务按 BullMQ attempts 有限重试');
    assert.equal(providerCalls.filter((input) => input.includes('COMPETE')).length, 1, '双 Worker 竞争只允许一次 Provider 请求');

    const eventIds = [...new Set(links.map((link) => link.event_id))];
    createdEventIds.push(...eventIds);
    const eventRows = await connection.db.select().from(events).where(inArray(events.id, eventIds));
    assert.equal(eventRows.find((event) => event.id === aEvent)?.article_count, 3);
    assert.equal(eventRows.find((event) => event.id === aEvent)?.source_count, 2);
    assert.equal(eventRows.every((event) => event.article_count === links.filter((link) => link.event_id === event.id).length), true, 'Event 缓存计数必须等于关系事实');
    assert.equal(eventRows.every((event) => links.filter((link) => link.event_id === event.id && link.is_primary).length === 1), true, '每个 Event 恰有唯一主报道');

    const beforeDuplicateCalls = providerCalls.length;
    const beforeDuplicateEmbeddings = embeddings.length;
    const beforeDuplicateLinks = links.length;
    await enqueueEmbeddingTask(connection.db, articleRows[0].id, async (payload, jobId) => { await runtimeOne.enqueueJob('embedding', payload, { jobId: `repeat-${jobId}` }); }, config);
    await runtimeOne.waitForIdle(30_000);
    assert.equal(providerCalls.length, beforeDuplicateCalls, '重复成功任务不得再次调用 Provider');
    assert.equal((await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, articleIds))).length, beforeDuplicateEmbeddings, '重复不得新增向量');
    assert.equal((await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, articleIds))).length, beforeDuplicateLinks, '重复不得新增关系');
  } finally {
    try {
      await runtimeOne.close({ drain: true });
    } finally {
      try {
        await runtimeTwo.close({ drain: true });
      } finally {
        try {
          await cleanupRedisPrefix(queuePrefix);
        } finally {
          try {
            await assertRedisPrefixEmpty(queuePrefix);
          } finally {
            await cleanupOwnFixture(articleIds, queuePrefix, sourceIds, createdEventIds);
          }
        }
      }
    }
  }
});

test('成功 Embedding 任务重放会恢复唯一 cluster task 与队列任务', async () => {
  const fixturePrefix = nextQueuePrefix('replay');
  const articleIds: string[] = [];
  const sourceIds: string[] = [];
  const config = embeddingConfig();
  const provider = config.provider!;
  const model = config.model!;
  const title = `${fixturePrefix} 当前标题`;
  const summary = `${fixturePrefix} 当前摘要`;
  const inputHash = hashEmbeddingInput(`${title.trim()}\n${summary.trim()}`);
  const runtime = createWorkerRuntime({
    db: connection.db,
    queuePrefix: fixturePrefix,
    concurrency: 1,
    embeddingConfig: config,
    embeddingProvider: new OpenAICompatibleEmbeddingProvider(config),
  });
  const queueJobId = () => `cluster-${clusterTaskId}`;
  let clusterTaskId = '';
  try {
    const source = (await connection.db.insert(sources).values({
      name: `${fixturePrefix}-source`,
      type: 'rss',
      country: 'US',
      language: 'zh',
      source_level: 'E',
      enabled: false,
      homepage: 'https://controlled.example',
    }).returning({ id: sources.id }))[0];
    assert.ok(source);
    sourceIds.push(source.id);
    const article = (await connection.db.insert(articles).values({
      source_id: source.id,
      original_url: `https://controlled.example/stage09/${fixturePrefix}/replay`,
      canonical_url: `https://controlled.example/stage09/${fixturePrefix}/replay`,
      content_hash: `${fixturePrefix}-content`,
      title_hash: `${fixturePrefix}-title`,
      original_title: title,
      title_zh: title,
      original_summary: summary,
      summary_zh: summary,
      original_language: 'zh',
      published_at: new Date('2026-08-19T07:00:00.000Z'),
      processing_status: 'embedded',
      is_hidden: false,
    }).returning({ id: articles.id }))[0];
    assert.ok(article);
    articleIds.push(article.id);
    const task = (await connection.db.insert(ai_tasks).values({
      task_type: 'embedding',
      article_id: article.id,
      status: 'success',
      prompt_version: config.embeddingVersion,
      model,
      provider,
      input_hash: inputHash,
      cache_key: embeddingCacheKey({
        articleId: article.id,
        inputHash,
        embeddingVersion: config.embeddingVersion,
        provider,
        model,
      }),
      result_json: { dimensions: 2, provider, model, inputHash },
    }).returning())[0];
    assert.ok(task);
    await connection.db.insert(article_embeddings).values({
      article_id: article.id,
      provider,
      model,
      dimensions: 2,
      embedding: [0, 1],
      input_hash: inputHash,
      embedding_version: config.embeddingVersion,
    });

    await runtime.start({ schedule: false });
    await runtime.pause();
    const callsBeforeReplay = providerCalls.length;
    await processEmbeddingTask({
      db: connection.db,
      config,
      provider: new OpenAICompatibleEmbeddingProvider(config),
      enqueueCluster: async (payload, jobId) => {
        await runtime.enqueueJob('cluster', payload, { jobId });
      },
    }, task.id, 1);
    const clusterTasksAfterFirstReplay = await connection.db.select().from(ai_tasks).where(inArray(ai_tasks.article_id, [article.id]));
    const clusterTask = clusterTasksAfterFirstReplay.find((row) => row.task_type === 'event-cluster');
    assert.ok(clusterTask, '成功 Embedding 重放必须创建 cluster task');
    clusterTaskId = clusterTask.id;
    assert.equal(providerCalls.length, callsBeforeReplay, '成功 Embedding 重放不得调用 Provider');
    assert.ok(await runtime.getJob('cluster', queueJobId()), '成功 Embedding 重放必须入队 cluster job');
    assert.equal((await runtime.getQueue('cluster').getJobCounts('waiting')).waiting, 1);

    await processEmbeddingTask({
      db: connection.db,
      config,
      provider: new OpenAICompatibleEmbeddingProvider(config),
      enqueueCluster: async (payload, jobId) => {
        await runtime.enqueueJob('cluster', payload, { jobId });
      },
    }, task.id, 1);
    const clusterTasksAfterSecondReplay = await connection.db.select().from(ai_tasks).where(inArray(ai_tasks.article_id, [article.id]));
    assert.equal(clusterTasksAfterSecondReplay.filter((row) => row.task_type === 'event-cluster').length, 1, '重放不得创建重复 cluster task');
    assert.equal(providerCalls.length, callsBeforeReplay, '再次重放不得调用 Provider');
    assert.equal((await runtime.getQueue('cluster').getJobCounts('waiting')).waiting, 1, '确定性 cluster job 不得重复入队');
  } finally {
    try {
      if (clusterTaskId) {
        const job = await runtime.getJob('cluster', queueJobId());
        if (job) await job.remove();
      }
    } finally {
      try {
        await runtime.close({ drain: true });
      } finally {
        try {
          await cleanupRedisPrefix(fixturePrefix);
        } finally {
          try {
            await assertRedisPrefixEmpty(fixturePrefix);
          } finally {
            await cleanupOwnFixture(articleIds, fixturePrefix, sourceIds);
          }
        }
      }
    }
  }
});

test('聚类候选只使用成员 Article 当前内容对应的 Embedding', async () => {
  const fixturePrefix = nextQueuePrefix('current');
  const articleIds: string[] = [];
  const sourceIds: string[] = [];
  const config = embeddingConfig();
  const provider = config.provider!;
  const model = config.model!;
  const now = new Date('2026-08-19T08:00:00.000Z');
  const memberTitle = `${fixturePrefix} 成员当前标题`;
  const memberSummary = `${fixturePrefix} 成员当前摘要`;
  const oldInputHash = hashEmbeddingInput(`${fixturePrefix} 成员旧标题\n${fixturePrefix} 成员旧摘要`);
  const currentInputHash = hashEmbeddingInput(`${memberTitle.trim()}\n${memberSummary.trim()}`);
  const candidateTitle = `${fixturePrefix} 待聚类标题`;
  const candidateSummary = `${fixturePrefix} 待聚类摘要`;
  const candidateInputHash = hashEmbeddingInput(`${candidateTitle.trim()}\n${candidateSummary.trim()}`);
  try {
    const source = (await connection.db.insert(sources).values({
      name: `${fixturePrefix}-source`,
      type: 'rss',
      country: 'US',
      language: 'zh',
      source_level: 'E',
      enabled: false,
      homepage: 'https://controlled.example',
    }).returning({ id: sources.id }))[0];
    assert.ok(source);
    sourceIds.push(source.id);
    const member = (await connection.db.insert(articles).values({
      source_id: source.id,
      original_url: `https://controlled.example/stage09/${fixturePrefix}/member`,
      canonical_url: `https://controlled.example/stage09/${fixturePrefix}/member`,
      content_hash: `${fixturePrefix}-member-content`,
      title_hash: `${fixturePrefix}-member-title`,
      original_title: memberTitle,
      title_zh: memberTitle,
      original_summary: memberSummary,
      summary_zh: memberSummary,
      original_language: 'zh',
      published_at: new Date('2026-08-19T07:00:00.000Z'),
      processing_status: 'embedded',
      is_hidden: false,
    }).returning({ id: articles.id }))[0];
    assert.ok(member);
    articleIds.push(member.id);
    const candidate = (await connection.db.insert(articles).values({
      source_id: source.id,
      original_url: `https://controlled.example/stage09/${fixturePrefix}/candidate`,
      canonical_url: `https://controlled.example/stage09/${fixturePrefix}/candidate`,
      content_hash: `${fixturePrefix}-candidate-content`,
      title_hash: `${fixturePrefix}-candidate-title`,
      original_title: candidateTitle,
      title_zh: candidateTitle,
      original_summary: candidateSummary,
      summary_zh: candidateSummary,
      original_language: 'zh',
      published_at: new Date('2026-08-19T07:30:00.000Z'),
      processing_status: 'embedded',
      is_hidden: false,
    }).returning({ id: articles.id }))[0];
    assert.ok(candidate);
    articleIds.push(candidate.id);
    const event = (await connection.db.insert(events).values({
      title: `${fixturePrefix} 已有 Event`,
      summary: `${fixturePrefix} 已有 Event 摘要`,
      first_seen_at: new Date('2026-08-19T07:00:00.000Z'),
      last_seen_at: new Date('2026-08-19T07:00:00.000Z'),
      article_count: 1,
      source_count: 1,
      status: 'developing',
    }).returning({ id: events.id }))[0];
    assert.ok(event);
    await connection.db.insert(event_articles).values({ event_id: event.id, article_id: member.id, is_primary: true, similarity_score: 1, confidence: 1, cluster_method: 'embedding' });
    await connection.db.insert(article_embeddings).values([
      { article_id: member.id, provider, model, dimensions: 2, embedding: [1, 0], input_hash: oldInputHash, embedding_version: config.embeddingVersion },
      { article_id: member.id, provider, model, dimensions: 2, embedding: [0, 1], input_hash: currentInputHash, embedding_version: config.embeddingVersion },
      { article_id: candidate.id, provider, model, dimensions: 2, embedding: [1, 0], input_hash: candidateInputHash, embedding_version: config.embeddingVersion },
    ]);
    const clusterTask = (await connection.db.insert(ai_tasks).values({
      task_type: 'event-cluster',
      article_id: candidate.id,
      status: 'pending',
      prompt_version: config.embeddingVersion,
      model,
      provider,
      input_hash: candidateInputHash,
      cache_key: `${fixturePrefix}-cluster-task`,
    }).returning())[0];
    assert.ok(clusterTask);

    const result = await processClusterTask({ db: connection.db, now: () => now }, clusterTask.id, 1);
    assert.equal(result.status, 'processed');
    assert.ok(result.eventId);
    assert.notEqual(result.eventId, event.id, '旧向量不得把新 Article 并入已有 Event');
    const candidateLink = (await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, [candidate.id])))[0];
    assert.equal(candidateLink?.event_id, result.eventId);
    assert.equal(candidateLink?.event_id === event.id, false);
    const memberEmbeddings = await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, [member.id]));
    assert.equal(memberEmbeddings.length, 2, '历史向量必须保留');
    assert.equal(memberEmbeddings.some((row) => row.input_hash === oldInputHash && row.embedding.join(',') === '1,0'), true, '旧向量必须保留');
  } finally {
    try {
      await cleanupRedisPrefix(fixturePrefix);
    } finally {
      try {
        await assertRedisPrefixEmpty(fixturePrefix);
      } finally {
        await cleanupOwnFixture(articleIds, fixturePrefix, sourceIds);
      }
    }
  }
});
