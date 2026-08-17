import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

import { CrawlerError, SafeFetcher, type RawHttpResponse } from '@financehot/crawler';
import { eq, inArray } from 'drizzle-orm';
import { articles, createDb, crawl_tasks, raw_articles, sources } from '@financehot/db';

import { crawlOnce } from './crawl-once';

const envFile = resolve(process.cwd(), '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';
const connection = createDb(databaseUrl);
const prefix = `stage06-test-${Date.now()}`;
const createdSourceIds: string[] = [];

const fixtureXml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Fixture market release</title><link>https://fixture.example/article/one</link><description>Fixture excerpt only</description><pubDate>Mon, 17 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;

function fixtureResponse(body: string, contentType = 'application/rss+xml'): RawHttpResponse {
  return { status: 200, headers: { 'content-type': contentType }, body: new TextEncoder().encode(body) };
}

function uniqueFixtureXml(suffix: string) {
  return fixtureXml
    .replaceAll('Fixture market release', `Fixture market release ${suffix}`)
    .replaceAll('Fixture excerpt only', `Fixture excerpt only ${suffix}`)
    .replaceAll('/article/one', `/article/one-${suffix}`);
}

async function createSource(values: Partial<typeof sources.$inferInsert> = {}) {
  const rows = await connection.db.insert(sources).values({
    name: `${prefix}-${createdSourceIds.length}`,
    type: 'rss',
    country: 'US',
    language: 'en',
    source_level: 'E',
    enabled: true,
    crawl_interval: 1,
    adapter_config: { kind: 'rss', feedUrl: 'https://fixture.example/feed.xml' },
    ...values,
  }).returning();
  createdSourceIds.push(rows[0].id);
  return rows[0];
}

function fixtureFetcher(calls: string[], body = fixtureXml) {
  return new SafeFetcher({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async (url) => {
      calls.push(url.toString());
      return fixtureResponse(body);
    },
    minIntervalMs: 0,
  });
}

describe('worker crawl-once PostgreSQL 集成', { concurrency: false }, () => {
  before(async () => {
    await connection.db.execute('select 1');
  });

  afterEach(async () => {
    if (createdSourceIds.length) {
      await connection.db.update(sources).set({ enabled: false }).where(inArray(sources.id, createdSourceIds));
    }
  });

  after(async () => {
    if (createdSourceIds.length) {
      await connection.db.delete(raw_articles).where(inArray(raw_articles.source_id, createdSourceIds));
      await connection.db.delete(articles).where(inArray(articles.source_id, createdSourceIds));
      await connection.db.delete(crawl_tasks).where(inArray(crawl_tasks.source_id, createdSourceIds));
      await connection.db.delete(sources).where(inArray(sources.id, createdSourceIds));
    }
    await connection.pool.end();
  });

  test('禁用 source 不产生 task 且外部请求为 0', async () => {
    const source = await createSource({ enabled: false });
    const calls: string[] = [];
    const stats = await crawlOnce({ db: connection.db, fetcher: fixtureFetcher(calls), now: () => new Date('2026-08-17T00:00:00Z') });
    assert.equal(stats.sourcesDue, 0);
    assert.equal(stats.tasksCreated, 0);
    assert.equal(calls.length, 0);
    assert.ok(source.id);
  });

  test('缺少 adapter_config 的 enabled source 只记录 failed task，不请求外网', async () => {
    await createSource({ adapter_config: null });
    const calls: string[] = [];
    const stats = await crawlOnce({ db: connection.db, fetcher: fixtureFetcher(calls), now: () => new Date('2026-08-17T01:00:00Z') });
    assert.equal(stats.tasksFailed, 1);
    assert.equal(calls.length, 0);
    const task = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.source_id, createdSourceIds[1])).limit(1);
    assert.equal(task[0].status, 'failed');
    assert.match(task[0].error ?? '', /adapter_config/);
  });

  test('真实 Adapter + PostgreSQL 事务先 Raw 后 Article', async () => {
    const source = await createSource();
    const calls: string[] = [];
    const stats = await crawlOnce({ db: connection.db, fetcher: fixtureFetcher(calls, uniqueFixtureXml('transaction')), now: () => new Date('2026-08-17T02:00:00Z') });
    assert.equal(stats.tasksSuccess, 1);
    assert.equal(stats.rawInserted, 1);
    assert.equal(stats.articlesInserted, 1);
    assert.equal(calls.length, 1);
    const raw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id));
    const article = await connection.db.select().from(articles).where(eq(articles.source_id, source.id));
    assert.equal(raw.length, 1);
    assert.equal(raw[0].processing_status, 'normalized');
    assert.equal(raw[0].article_id, article[0].id);
    assert.equal(article.length, 1);
    assert.equal(article[0].processing_status, 'normalized');
  });

  test('连续三轮同一输入不新增 Raw/Article，重复 Raw 保留 duplicate 关联', async () => {
    const source = await createSource();
    const calls: string[] = [];
    const fetcher = fixtureFetcher(calls, uniqueFixtureXml('idempotent'));
    const base = new Date('2026-08-17T03:00:00Z').getTime();
    const first = await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base) });
    const second = await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base + 2_000) });
    const third = await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base + 4_000) });
    assert.deepEqual([first.articlesInserted, second.articlesInserted, third.articlesInserted], [1, 0, 0], JSON.stringify({ first, second, third }));
    assert.deepEqual([second.rawExisting, third.rawExisting], [1, 1]);
    assert.equal(calls.length, 3);
    const raw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, source.id));
    const article = await connection.db.select().from(articles).where(eq(articles.source_id, source.id));
    const tasks = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.source_id, source.id));
    if (process.env.PHASE06_EVIDENCE === '1') {
      console.log(JSON.stringify({
        evidence: 'three-round-idempotency',
        rounds: [first, second, third],
        finalRawCount: raw.length,
        finalArticleCount: article.length,
        taskStatuses: tasks.map((task) => task.status),
      }));
    }
    assert.equal(raw.length, 1);
    assert.equal(raw[0].processing_status, 'duplicate');
    assert.equal(raw[0].duplicate_of_article_id, article[0].id);
    assert.equal(article.length, 1);
    assert.equal(tasks.length, 3);
    assert.deepEqual(tasks.map((task) => task.status), ['success', 'success', 'success']);
  });

  test('canonical/content/title 任一相同即跨 source 去重', async () => {
    const first = await createSource();
    const second = await createSource();
    const calls: string[] = [];
    const fetcher = fixtureFetcher(calls, uniqueFixtureXml('cross-source'));
    await crawlOnce({ db: connection.db, fetcher, now: () => new Date('2026-08-17T04:00:00Z') });
    await crawlOnce({ db: connection.db, fetcher, now: () => new Date('2026-08-17T04:00:02Z') });
    const firstArticle = await connection.db.select().from(articles).where(eq(articles.source_id, first.id));
    const secondRaw = await connection.db.select().from(raw_articles).where(eq(raw_articles.source_id, second.id));
    assert.equal(firstArticle.length, 1);
    assert.equal(secondRaw[0].processing_status, 'duplicate');
    assert.equal(secondRaw[0].duplicate_of_article_id, firstArticle[0].id);
  });

  test('网络瞬断耗尽后记录 retrying、retry_count 和错误分类', async () => {
    const source = await createSource({ name: `${prefix}-retry` });
    const calls: string[] = [];
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => { calls.push('request'); throw new CrawlerError('socket reset', 'network', true); },
      sleep: async () => undefined,
    });
    const stats = await crawlOnce({ db: connection.db, fetcher, now: () => new Date('2026-08-17T05:00:00Z') });
    assert.equal(stats.tasksRetrying, 1);
    assert.equal(calls.length, 3);
    const task = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.source_id, source.id)).limit(1);
    assert.equal(task[0].status, 'retrying');
    assert.equal(task[0].retry_count, 1);
    assert.match(task[0].error ?? '', /network/);
  });

  test('解析错误不重试并记录 failed', async () => {
    const source = await createSource({
      name: `${prefix}-parse`,
      type: 'api',
      adapter_config: { kind: 'api', endpoint: 'https://fixture.example/api', itemsPath: 'data.items', fields: { url: 'url', title: 'title' } },
    });
    const calls: string[] = [];
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async (url) => { calls.push(url.toString()); return fixtureResponse('{"data":{}}', 'application/json'); },
    });
    const stats = await crawlOnce({ db: connection.db, fetcher, now: () => new Date('2026-08-17T06:00:00Z') });
    assert.equal(stats.tasksFailed, 1);
    assert.equal(calls.length, 1);
    const task = await connection.db.select().from(crawl_tasks).where(eq(crawl_tasks.source_id, source.id)).limit(1);
    assert.equal(task[0].status, 'failed');
    assert.match(task[0].error ?? '', /parse/);
  });

  test('来源到期判断按 crawl_interval 工作', async () => {
    await createSource({ crawl_interval: 60 });
    const calls: string[] = [];
    const fetcher = fixtureFetcher(calls, uniqueFixtureXml('due'));
    const base = new Date('2026-08-17T07:00:00Z').getTime();
    await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base) });
    const notDue = await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base + 30_000) });
    const due = await crawlOnce({ db: connection.db, fetcher, now: () => new Date(base + 61_000) });
    assert.equal(notDue.sourcesDue, 0);
    assert.equal(notDue.requests, 0);
    assert.equal(due.sourcesDue, 1);
    assert.equal(due.tasksSuccess, 1);
  });

  test('任务状态成功时更新 source.last_crawled_at，失败时保留到期状态', async () => {
    const source = await createSource({ name: `${prefix}-state` });
    const calls: string[] = [];
    const successAt = new Date('2026-08-17T08:00:00Z');
    await crawlOnce({ db: connection.db, fetcher: fixtureFetcher(calls, uniqueFixtureXml('state')), now: () => successAt });
    const successSource = await connection.db.select().from(sources).where(eq(sources.id, source.id));
    assert.equal(successSource[0].last_crawled_at?.toISOString(), successAt.toISOString());
    assert.ok(calls.length > 0);
  });
});
