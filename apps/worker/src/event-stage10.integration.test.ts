import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';

import {
  OpenAICompatibleProvider,
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
import { and, eq, inArray, like } from 'drizzle-orm';

import { processClusterTask } from './cluster-pipeline';
import { mergeEvents, splitEvent } from './event-corrections';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);
const prefix = `stage10-it-${process.pid}-${Date.now()}`;
const embeddingProvider = 'stage10-controlled';
const embeddingModel = 'stage10-embedding';
const embeddingVersion = 'stage10-embedding-v1';
let providerServer: Server | undefined;
let providerUrl = '';
const providerBodies: string[] = [];

async function readBody(request: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

async function cleanupFixture(articleIds: string[], sourceIds: string[], eventIds: string[]) {
  const linked = articleIds.length
    ? await connection.db.select({ eventId: event_articles.event_id }).from(event_articles).where(inArray(event_articles.article_id, articleIds))
    : [];
  const titled = await connection.db.select({ id: events.id }).from(events).where(like(events.title, `${prefix}%`));
  const allEventIds = [...new Set([...eventIds, ...linked.map((row) => row.eventId), ...titled.map((row) => row.id)])];
  if (articleIds.length) {
    const taskRows = await connection.db.select({ id: ai_tasks.id }).from(ai_tasks).where(inArray(ai_tasks.article_id, articleIds));
    if (taskRows.length) await connection.db.delete(ai_usage).where(inArray(ai_usage.ai_task_id, taskRows.map((row) => row.id)));
    await connection.db.delete(ai_tasks).where(inArray(ai_tasks.article_id, articleIds));
  }
  if (allEventIds.length) {
    await connection.db.execute(`DELETE FROM event_timeline WHERE event_id = ANY(ARRAY[${allEventIds.map((id) => `'${id}'`).join(',')}]::uuid[])`);
    await connection.db.execute(`DELETE FROM event_topics WHERE event_id = ANY(ARRAY[${allEventIds.map((id) => `'${id}'`).join(',')}]::uuid[])`);
    await connection.db.delete(event_articles).where(inArray(event_articles.event_id, allEventIds));
    await connection.db.delete(events).where(inArray(events.id, allEventIds));
  }
  if (articleIds.length) {
    await connection.db.delete(article_embeddings).where(inArray(article_embeddings.article_id, articleIds));
    await connection.db.delete(article_categories).where(inArray(article_categories.article_id, articleIds));
    await connection.db.delete(articles).where(inArray(articles.id, articleIds));
  }
  if (sourceIds.length) await connection.db.delete(sources).where(inArray(sources.id, sourceIds));
}

function inputHash(title: string, summary: string) {
  return createHash('sha256').update(`${title.trim()}\n${summary.trim()}`, 'utf8').digest('hex');
}

async function insertArticle(sourceId: string, title: string, summary: string, publishedAt: string, articleIds: string[]) {
  const row = (await connection.db.insert(articles).values({
    source_id: sourceId,
    original_url: `https://stage10.example/${prefix}/${articleIds.length}`,
    canonical_url: `https://stage10.example/${prefix}/${articleIds.length}`,
    content_hash: `${prefix}-content-${articleIds.length}`,
    title_hash: `${prefix}-title-${articleIds.length}`,
    original_title: title,
    title_zh: title,
    original_summary: summary,
    summary_zh: summary,
    original_language: 'zh',
    published_at: new Date(publishedAt),
    processing_status: 'embedded',
    is_hidden: false,
  }).returning({ id: articles.id }))[0];
  if (!row) throw new Error('阶段10测试 Article 创建失败');
  articleIds.push(row.id);
  return row.id;
}

async function insertClusterTask(articleId: string, vector: number[]) {
  const article = (await connection.db.select({ title: articles.title_zh, summary: articles.summary_zh }).from(articles).where(eq(articles.id, articleId)).limit(1))[0];
  if (!article) throw new Error(`测试 Article 不存在: ${articleId}`);
  const hash = inputHash(article.title ?? '', article.summary ?? '');
  await connection.db.insert(article_embeddings).values({
    article_id: articleId,
    provider: embeddingProvider,
    model: embeddingModel,
    dimensions: vector.length,
    embedding: vector,
    input_hash: hash,
    embedding_version: embeddingVersion,
  });
  const task = (await connection.db.insert(ai_tasks).values({
    task_type: 'event-cluster',
    article_id: articleId,
    status: 'pending',
    prompt_version: embeddingVersion,
    model: embeddingModel,
    provider: embeddingProvider,
    input_hash: hash,
    cache_key: `${prefix}|cluster|${articleId}`,
  }).returning())[0];
  if (!task) throw new Error('阶段10测试 cluster task 创建失败');
  return task.id;
}

async function categoryId(slug: string) {
  const row = (await connection.db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1))[0];
  if (!row) throw new Error(`缺少 Seed 分类: ${slug}`);
  return row.id;
}

const clusterOptions = (now: Date) => ({
  db: connection.db,
  now: () => now,
  similarityThreshold: 0.86,
  directMergeThreshold: 0.93,
  titleFeatureThreshold: 0.2,
  llmMinConfidence: 0.78,
  timeWindowHours: 72,
});

before(async () => {
  await connection.db.execute('select 1');
  await new Promise<void>((resolvePromise, reject) => {
    providerServer = createServer(async (request, response) => {
      const body = await readBody(request);
      providerBodies.push(body);
      if (request.url?.endsWith('/embeddings')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ model: embeddingModel, data: [{ index: 0, embedding: [1, 0, 0] }] }));
        return;
      }
      const eventDecision = body.includes('STAGE10_BOUNDARY')
        ? { decision: 'merge', confidence: 0.91, reason: '同公司同事实，标题措辞存在边界差异。', title: 'Alpha Corp 财报（多信源核验）', summary: '多家信源报道 Alpha Corp 的同一份财报事实。' }
        : { countries: [], markets: [], assets: [], companies: ['Controlled Corp'], people: [], tickerCandidates: [] };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'stage10-controlled-llm', choices: [{ message: { content: JSON.stringify(eventDecision) } }] }));
    });
    providerServer.once('error', reject);
    providerServer.listen(0, '127.0.0.1', () => {
      const address = providerServer?.address();
      if (!address || typeof address === 'string') return reject(new Error('阶段10测试 Provider 未取得端口'));
      providerUrl = `http://127.0.0.1:${address.port}/v1`;
      resolvePromise();
    });
  });
});

after(async () => {
  await new Promise<void>((resolvePromise) => {
    if (!providerServer) return resolvePromise();
    providerServer.closeAllConnections();
    providerServer.close(() => resolvePromise());
  });
  await connection.pool.end();
});

test('阶段10多信源候选保护、事实更新与安全重放', async () => {
  const articleIds: string[] = [];
  const sourceIds: string[] = [];
  const eventIds: string[] = [];
  const now = new Date('2026-08-19T12:00:00.000Z');
  const corporateId = await categoryId('corporate');
  const techId = await categoryId('tech');
  const sourceLevels = ['A', 'B', 'C', 'D', 'E'] as const;
  try {
    const sourceRows = await connection.db.insert(sources).values(sourceLevels.map((level, index) => ({
      name: `${prefix}-source-${index}`,
      type: 'rss' as const,
      country: 'US',
      language: 'zh',
      source_level: level,
      credibility_score: 100 - index * 10,
      enabled: false,
      homepage: 'https://stage10.example',
    }))).returning({ id: sources.id });
    sourceIds.push(...sourceRows.map((row) => row.id));
    const factTitle = '阶段10 Alpha Corp 财报';
    const factSummary = 'STAGE10_FACT Alpha Corp 发布同一份季度财报，利润保持稳定。';
    const factArticleIds: string[] = [];
    for (let index = 0; index < sourceRows.length; index += 1) {
      const articleId = await insertArticle(sourceRows[index]!.id, factTitle, factSummary, `2026-08-19T0${index}:00:00.000Z`, articleIds);
      factArticleIds.push(articleId);
      await connection.db.insert(article_categories).values({ article_id: articleId, category_id: corporateId, confidence: 0.95 });
      const taskId = await insertClusterTask(articleId, [1, 0, 0]);
      await processClusterTask(clusterOptions(now), taskId, 1);
    }
    const factLinks = await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, factArticleIds));
    assert.equal(new Set(factLinks.map((row) => row.event_id)).size, 1, '五个不同信源的同一事实必须归一 Event');
    const factEventId = factLinks[0]!.event_id;
    eventIds.push(factEventId);
    const factEvent = (await connection.db.select().from(events).where(eq(events.id, factEventId)).limit(1))[0]!;
    assert.equal(factEvent.article_count, 5);
    assert.equal(factEvent.source_count, 5);
    assert.equal(factEvent.status, 'developing');
    assert.equal(factEvent.first_seen_at?.toISOString(), '2026-08-19T00:00:00.000Z');
    assert.equal(factEvent.last_seen_at?.toISOString(), '2026-08-19T04:00:00.000Z');
    assert.equal(factLinks.filter((row) => row.is_primary).length, 1);
    assert.equal(providerBodies.length, 0, '高置信合并不得调用 LLM');

    const differentArticle = await insertArticle(sourceRows[0]!.id, '阶段10 Alpha Corp 收购', '同日同公司发生另一项收购事实。', '2026-08-19T05:00:00.000Z', articleIds);
    await connection.db.insert(article_categories).values({ article_id: differentArticle, category_id: corporateId, confidence: 0.95 });
    const differentTask = await insertClusterTask(differentArticle, [1, 0, 0]);
    await processClusterTask(clusterOptions(now), differentTask, 1);

    const lowArticle = await insertArticle(sourceRows[1]!.id, factTitle, '低相似的另一篇报道。', '2026-08-19T06:00:00.000Z', articleIds);
    await connection.db.insert(article_categories).values({ article_id: lowArticle, category_id: corporateId, confidence: 0.95 });
    const lowTask = await insertClusterTask(lowArticle, [0, 0, 1]);
    await processClusterTask(clusterOptions(now), lowTask, 1);

    const conflictArticle = await insertArticle(sourceRows[2]!.id, factTitle, '分类冲突的另一篇报道。', '2026-08-19T07:00:00.000Z', articleIds);
    await connection.db.insert(article_categories).values({ article_id: conflictArticle, category_id: techId, confidence: 0.95 });
    const conflictTask = await insertClusterTask(conflictArticle, [1, 0, 0]);
    await processClusterTask(clusterOptions(now), conflictTask, 1);

    const protectedLinks = await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, [differentArticle, lowArticle, conflictArticle]));
    assert.equal(protectedLinks.every((row) => row.event_id !== factEventId), true, '不同事实、低相似、分类冲突均不得误合并');
    eventIds.push(...protectedLinks.map((row) => row.event_id));

    const beforeReplayLinks = (await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, articleIds))).length;
    const beforeReplayEmbeddings = (await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, articleIds))).length;
    const replay = await processClusterTask(clusterOptions(now), (await connection.db.select({ id: ai_tasks.id }).from(ai_tasks).where(eq(ai_tasks.article_id, factArticleIds[4]!)).limit(1))[0]!.id, 2);
    assert.equal(replay.status, 'cached');
    assert.equal((await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, articleIds))).length, beforeReplayLinks);
    assert.equal((await connection.db.select().from(article_embeddings).where(inArray(article_embeddings.article_id, articleIds))).length, beforeReplayEmbeddings);
    assert.equal(providerBodies.length, 0);
  } finally {
    await cleanupFixture(articleIds, sourceIds, eventIds);
  }
});

test('阶段10边界只调用一次结构化 LLM，未配置时保守新建并可缓存重放', async () => {
  const articleIds: string[] = [];
  const sourceIds: string[] = [];
  const eventIds: string[] = [];
  const now = new Date('2026-08-19T12:00:00.000Z');
  const corporateId = await categoryId('corporate');
  const llmConfig: LLMConfig = {
    provider: 'openai-compatible',
    baseUrl: providerUrl,
    model: 'stage10-controlled-llm',
    apiKey: 'local-controlled-key',
    timeoutMs: 2_000,
    maxRetries: 0,
    retryDelayMs: 0,
  };
  const llmProvider = new OpenAICompatibleProvider(llmConfig);
  try {
    const sourceRows = await connection.db.insert(sources).values([0, 1].map((index) => ({
      name: `${prefix}-boundary-source-${index}`,
      type: 'rss' as const,
      country: 'US',
      language: 'zh',
      source_level: 'E' as const,
      enabled: false,
      homepage: 'https://stage10.example',
    }))).returning({ id: sources.id });
    sourceIds.push(...sourceRows.map((row) => row.id));
    const first = await insertArticle(sourceRows[0]!.id, 'STAGE10_BOUNDARY Alpha Corp 重大进展', '同一事实的首篇报道。', '2026-08-19T08:00:00.000Z', articleIds);
    const second = await insertArticle(sourceRows[1]!.id, 'STAGE10_BOUNDARY Alpha Corp 重大进展', '同一事实的边界报道。', '2026-08-19T09:00:00.000Z', articleIds);
    await connection.db.insert(article_categories).values([
      { article_id: first, category_id: corporateId, confidence: 0.95 },
      { article_id: second, category_id: corporateId, confidence: 0.95 },
    ]);
    const firstTask = await insertClusterTask(first, [1, 0, 0]);
    await processClusterTask(clusterOptions(now), firstTask, 1);
    const secondTask = await insertClusterTask(second, [0.9, 0.435889894, 0]);
    const callsBefore = providerBodies.length;
    const options = { ...clusterOptions(now), llmConfig, llmProvider };
    await processClusterTask(options, secondTask, 1);
    assert.equal(providerBodies.length, callsBefore + 1, '边界候选只允许一次 LLM 请求');
    const links = await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, [first, second]));
    assert.equal(new Set(links.map((row) => row.event_id)).size, 1);
    assert.equal(links.find((row) => row.article_id === second)?.cluster_method, 'llm');
    assert.equal(links.find((row) => row.article_id === second)?.confidence, 0.91);
    const eventId = links[0]!.event_id;
    eventIds.push(eventId);
    const event = (await connection.db.select().from(events).where(eq(events.id, eventId)).limit(1))[0]!;
    assert.equal(event.title, 'Alpha Corp 财报（多信源核验）');
    assert.equal(event.article_count, 2);
    assert.equal(event.source_count, 2);
    const decisionTask = (await connection.db.select().from(ai_tasks).where(and(eq(ai_tasks.article_id, second), eq(ai_tasks.task_type, 'event-cluster')))).find((task) => task.event_id === eventId);
    assert.ok(decisionTask?.status === 'success');
    const usageCount = (await connection.db.select().from(ai_usage).where(eq(ai_usage.ai_task_id, decisionTask!.id))).length;
    const taskCount = (await connection.db.select().from(ai_tasks).where(eq(ai_tasks.article_id, second))).length;
    const linkCount = links.length;
    const replay = await processClusterTask(options, secondTask, 2);
    assert.equal(replay.status, 'cached');
    assert.equal(providerBodies.length, callsBefore + 1);
    assert.equal((await connection.db.select().from(ai_usage).where(eq(ai_usage.ai_task_id, decisionTask!.id))).length, usageCount);
    assert.equal((await connection.db.select().from(ai_tasks).where(eq(ai_tasks.article_id, second))).length, taskCount);
    assert.equal((await connection.db.select().from(event_articles).where(inArray(event_articles.article_id, [first, second]))).length, linkCount);

    const conservative = await insertArticle(sourceRows[0]!.id, 'STAGE10_BOUNDARY Alpha Corp 重大进展', '无配置时边界报道。', '2026-08-19T10:00:00.000Z', articleIds);
    await connection.db.insert(article_categories).values({ article_id: conservative, category_id: corporateId, confidence: 0.95 });
    const conservativeTask = await insertClusterTask(conservative, [0.9, 0, 0.435889894]);
    let unconfiguredCalls = 0;
    const unconfiguredProvider = { generateJSONWithUsage: async () => { unconfiguredCalls += 1; throw new Error('未配置路径不应调用'); } } as never;
    await processClusterTask({ ...clusterOptions(now), llmProvider: unconfiguredProvider }, conservativeTask, 1);
    const conservativeLink = (await connection.db.select().from(event_articles).where(eq(event_articles.article_id, conservative)).limit(1))[0]!;
    assert.notEqual(conservativeLink.event_id, eventId);
    assert.equal(unconfiguredCalls, 0);
    eventIds.push(conservativeLink.event_id);
  } finally {
    await cleanupFixture(articleIds, sourceIds, eventIds);
  }
});

test('阶段10 merge/split 服务事务化、幂等、回滚并保持唯一主报道', async () => {
  const articleIds: string[] = [];
  const sourceIds: string[] = [];
  const eventIds: string[] = [];
  const now = new Date('2026-08-19T12:00:00.000Z');
  try {
    const sourceRows = await connection.db.insert(sources).values([0, 1, 2, 3].map((index) => ({
      name: `${prefix}-correction-source-${index}`,
      type: 'rss' as const,
      country: 'US',
      language: 'zh',
      source_level: 'E' as const,
      enabled: false,
      homepage: 'https://stage10.example',
    }))).returning({ id: sources.id });
    sourceIds.push(...sourceRows.map((row) => row.id));
    const mergeArticles: string[] = [];
    for (const [index, source] of sourceRows.slice(0, 2).entries()) {
      mergeArticles.push(await insertArticle(source.id, `${prefix} merge article ${index}`, `${prefix} merge summary`, `2026-08-19T0${index}:00:00.000Z`, articleIds));
    }
    const target = (await connection.db.insert(events).values({ title: `${prefix} merge target`, summary: 'target', article_count: 2, source_count: 2, first_seen_at: new Date('2026-08-19T00:00:00Z'), last_seen_at: new Date('2026-08-19T01:00:00Z'), status: 'developing' }).returning({ id: events.id }))[0]!;
    const source = (await connection.db.insert(events).values({ title: `${prefix} merge source`, summary: 'source', article_count: 0, source_count: 0, status: 'developing' }).returning({ id: events.id }))[0]!;
    eventIds.push(target.id, source.id);
    await connection.db.insert(event_articles).values([
      { event_id: target.id, article_id: mergeArticles[0]!, is_primary: true, similarity_score: 1, confidence: 1, cluster_method: 'embedding' as const },
      { event_id: source.id, article_id: mergeArticles[1]!, is_primary: true, similarity_score: 0.9, confidence: 0.9, cluster_method: 'embedding' as const },
    ]);
    const merged = await Promise.all([
      mergeEvents(connection.db, { sourceEventId: source.id, targetEventId: target.id, now }),
      mergeEvents(connection.db, { sourceEventId: source.id, targetEventId: target.id, now }),
    ]);
    assert.equal(merged.some((result) => !result.idempotent), true);
    assert.equal(merged.every((result) => result.targetEventId === target.id), true);
    const mergedLinks = await connection.db.select().from(event_articles).where(eq(event_articles.event_id, target.id));
    assert.equal(mergedLinks.length, 2);
    assert.equal(mergedLinks.filter((row) => row.is_primary).length, 1);
    const mergedEvent = (await connection.db.select().from(events).where(eq(events.id, target.id)).limit(1))[0]!;
    assert.equal(mergedEvent.article_count, 2);
    assert.equal(mergedEvent.source_count, 2);
    assert.equal((await connection.db.select().from(events).where(eq(events.id, source.id))).length, 0);

    const splitArticles: string[] = [];
    for (const [index, sourceRow] of sourceRows.slice(2).entries()) {
      splitArticles.push(await insertArticle(sourceRow.id, `${prefix} split article ${index}`, `${prefix} split summary`, `2026-08-19T0${index + 2}:00:00.000Z`, articleIds));
    }
    const splitEventId = (await connection.db.insert(events).values({ title: `${prefix} split event`, summary: 'split', article_count: 2, source_count: 2, status: 'developing' }).returning({ id: events.id }))[0]!.id;
    eventIds.push(splitEventId);
    await connection.db.insert(event_articles).values(splitArticles.map((articleId, index) => ({ event_id: splitEventId, article_id: articleId, is_primary: index === 0, similarity_score: 1, confidence: 1, cluster_method: 'embedding' as const })));
    await assert.rejects(splitEvent(connection.db, { eventId: splitEventId, articleIds: [mergeArticles[0]!] }));
    assert.equal((await connection.db.select().from(event_articles).where(eq(event_articles.event_id, splitEventId))).length, 2, '非法 split 必须回滚且不丢成员');
    const split = await splitEvent(connection.db, { eventId: splitEventId, articleIds: [splitArticles[1]!], now });
    eventIds.push(split.newEventId);
    assert.equal(split.articleCount, 1);
    const originalLinks = await connection.db.select().from(event_articles).where(eq(event_articles.event_id, splitEventId));
    const newLinks = await connection.db.select().from(event_articles).where(eq(event_articles.event_id, split.newEventId));
    assert.deepEqual(originalLinks.map((row) => row.article_id), [splitArticles[0]]);
    assert.deepEqual(newLinks.map((row) => row.article_id), [splitArticles[1]]);
    assert.equal(originalLinks.filter((row) => row.is_primary).length, 1);
    assert.equal(newLinks.filter((row) => row.is_primary).length, 1);
    const splitAgain = await splitEvent(connection.db, { eventId: splitEventId, articleIds: [splitArticles[1]!], now });
    assert.equal(splitAgain.idempotent, true);
    assert.equal(splitAgain.newEventId, split.newEventId);
    assert.equal((await connection.db.select().from(event_articles).where(eq(event_articles.event_id, split.newEventId))).length, 1);
  } finally {
    await cleanupFixture(articleIds, sourceIds, eventIds);
  }
});
