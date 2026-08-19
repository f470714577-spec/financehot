import { strict as assert } from 'node:assert';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

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
import { inArray } from 'drizzle-orm';

import { createOrGetAiTask } from './ai-pipeline';
import { createOrGetEmbeddingTask, enqueueEmbeddingTask } from './embedding-pipeline';
import { createWorkerRuntime } from './queue/runtime';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);
const queuePrefix = `stage09-it-${process.pid}-${Date.now()}`;
const createdArticleIds: string[] = [];
const createdEventIds: string[] = [];
const createdSourceIds: string[] = [];
let providerServer: Server | undefined;
let providerUrl = '';
const providerCalls: string[] = [];

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
  if (createdArticleIds.length) {
    await connection.db.delete(event_articles).where(inArray(event_articles.article_id, createdArticleIds));
    await connection.db.delete(article_embeddings).where(inArray(article_embeddings.article_id, createdArticleIds));
    const taskRows = await connection.db.select({ id: ai_tasks.id }).from(ai_tasks).where(inArray(ai_tasks.article_id, createdArticleIds));
    if (taskRows.length) await connection.db.delete(ai_usage).where(inArray(ai_usage.ai_task_id, taskRows.map((row) => row.id)));
    await connection.db.delete(ai_tasks).where(inArray(ai_tasks.article_id, createdArticleIds));
    await connection.db.delete(article_categories).where(inArray(article_categories.article_id, createdArticleIds));
    await connection.db.delete(articles).where(inArray(articles.id, createdArticleIds));
  }
  if (createdEventIds.length) {
    await connection.db.delete(events).where(inArray(events.id, createdEventIds));
  }
  if (createdSourceIds.length) {
    await connection.db.delete(sources).where(inArray(sources.id, createdSourceIds));
  }
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
  const sourceRows = await connection.db.insert(sources).values([
    { name: `${queuePrefix}-source-a`, type: 'rss', country: 'US', language: 'zh', source_level: 'E', enabled: false, homepage: 'https://controlled.example' },
    { name: `${queuePrefix}-source-b`, type: 'rss', country: 'GB', language: 'zh', source_level: 'E', enabled: false, homepage: 'https://controlled.example' },
  ]).returning({ id: sources.id });
  createdSourceIds.push(...sourceRows.map((row) => row.id));
  const categoryRows = await connection.db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryId = (slug: string) => categoryRows.find((row) => row.slug === slug)?.id ?? (() => { throw new Error(`缺少 Seed 分类: ${slug}`); })();
  const now = new Date('2026-08-19T08:00:00.000Z');
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
  createdArticleIds.push(...articleRows.map((row) => row.id));
  await connection.db.insert(article_categories).values(fixture.map((item, index) => ({ article_id: articleRows[index].id, category_id: categoryId(item.category), confidence: 0.95 })));

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
  await runtimeOne.start({ schedule: false });
  await runtimeTwo.start({ schedule: false });
  try {
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

    const embeddings = await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, createdArticleIds));
    const tasks = await connection.db.select().from(ai_tasks).where(inArray(ai_tasks.article_id, createdArticleIds));
    const links = await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, createdArticleIds));
    const resultArticles = await connection.db.select().from(articles).where(inArray(articles.id, createdArticleIds));
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
    assert.equal((await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, createdArticleIds))).length, beforeDuplicateEmbeddings, '重复不得新增向量');
    assert.equal((await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, createdArticleIds))).length, beforeDuplicateLinks, '重复不得新增关系');
  } finally {
    await runtimeOne.close({ force: true });
    await runtimeTwo.close({ force: true });
  }
});
