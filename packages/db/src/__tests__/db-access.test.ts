import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { createDb } from '../client';
import * as schema from '../schema';

// 与 seed 一致：加载根目录 .env，回退本地 docker 默认连接串
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://financehot:financehot@localhost:5433/financehot';

describe('DB 访问层（需已执行 migrate + seed 的本地 postgres）', () => {
  let db: ReturnType<typeof createDb>['db'];
  let pool: ReturnType<typeof createDb>['pool'];

  before(() => {
    const created = createDb(DATABASE_URL);
    db = created.db;
    pool = created.pool;
  });

  after(async () => {
    await pool.end();
  });

  test('seed 数据规模符合阶段 02 要求', async () => {
    const [sources, articles, events, reports] = await Promise.all([
      db.$count(schema.sources),
      db.$count(schema.articles),
      db.$count(schema.events),
      db.$count(schema.daily_reports),
    ]);
    assert.ok(sources >= 15, `sources=${sources}，期望 >= 15`);
    assert.ok(articles >= 80, `articles=${articles}，期望 >= 80`);
    assert.equal(events, 12, `events=${events}，期望 = 12`);
    assert.equal(reports, 1, `daily_reports=${reports}，期望 = 1`);
  });

  test('基本 CRUD：插入并查询一条 source', async () => {
    const name = `[Demo] test-${Date.now()}`;
    const inserted = await db
      .insert(schema.sources)
      .values({ name, type: 'rss', source_level: 'E' })
      .returning({ id: schema.sources.id });

    const rows = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.name, name));
    assert.equal(rows.length, 1);

    await db.delete(schema.sources).where(eq(schema.sources.id, inserted[0].id));
  });

  test('关联查询：event 的 event_articles 计数等于其 article_count 缓存', async () => {
    const ev = await db.select().from(schema.events).limit(1);
    assert.ok(ev.length > 0, '无事件数据，请先执行 seed');

    const links = await db
      .select()
      .from(schema.event_articles)
      .where(eq(schema.event_articles.event_id, ev[0].id));
    assert.equal(links.length, ev[0].article_count);
  });

  test('vector 列往返：插入并读回 embedding', async () => {
    const art = await db.select().from(schema.articles).limit(1);
    assert.ok(art.length > 0, '无 article 数据，请先执行 seed');

    // 用 2 的幂，避免 float32 精度误差
    const vec = [0.5, 0.25, 0.125];
    const inserted = await db
      .insert(schema.article_embeddings)
      .values({
        article_id: art[0].id,
        provider: 'test-provider',
        model: 'test-model',
        dimensions: vec.length,
        embedding: vec,
        input_hash: `test-hash-${Date.now()}`,
        embedding_version: 'v1',
      })
      .returning({ id: schema.article_embeddings.id });

    const rows = await db
      .select()
      .from(schema.article_embeddings)
      .where(eq(schema.article_embeddings.id, inserted[0].id));
    assert.equal(rows.length, 1);
    const got = rows[0].embedding;
    assert.equal(got.length, vec.length);
    for (let i = 0; i < vec.length; i++) {
      assert.ok(
        Math.abs(got[i] - vec[i]) < 1e-6,
        `embedding[${i}] 误差过大：${got[i]} vs ${vec[i]}`,
      );
    }

    await db
      .delete(schema.article_embeddings)
      .where(eq(schema.article_embeddings.id, inserted[0].id));
  });
});
