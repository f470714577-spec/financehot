import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { getQueryCount, resetQueryCount } from '@financehot/db';
import { getDb } from '../lib/db';
import { GET as getNews } from '../app/api/news/route';
import { GET as getNewsDetail } from '../app/api/news/[id]/route';
import { GET as getEvents } from '../app/api/events/route';
import { GET as getEventDetail } from '../app/api/events/[id]/route';
import { GET as getHot } from '../app/api/hot/route';
import { GET as getDaily } from '../app/api/daily/route';
import { GET as getTopics } from '../app/api/topics/route';
import { GET as getTopicDetail } from '../app/api/topics/[id]/route';
import { GET as getSearch } from '../app/api/search/route';

const baseUrl = 'http://localhost/api';

type Envelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
};

type List<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
type News = { id: string; title: string; publishedAt: string | null; source: { id: string; sourceLevel: string; credibilityScore: number | null }; event: { id: string } | null; market: string; score: number };
type Event = { id: string; title: string; status: string; articleCount: number; sourceCount: number; articles: News[] };
type Topic = { id: string; slug: string; name: string };

async function read<T>(response: Response): Promise<Envelope<T>> {
  return response.json() as Promise<Envelope<T>>;
}

function request(path: string) {
  return new Request(`${baseUrl}${path}`);
}

async function list<T>(handler: (request: Request) => Promise<Response>, path: string) {
  const response = await handler(request(path));
  const body = await read<List<T>>(response);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data);
  return body.data!;
}

describe('阶段 10 Event API PostgreSQL 集成测试', () => {
  let testHotEventId = '';

  before(async () => {
    assert.ok(process.env.DATABASE_URL || 'postgresql://financehot:financehot@localhost:5433/financehot');
    const now = new Date();
    const supportingArticles = (await getDb().pool.query<{ articleId: string; sourceId: string }>(`
      SELECT ea.article_id AS "articleId", a.source_id AS "sourceId"
      FROM event_articles ea
      INNER JOIN articles a ON a.id = ea.article_id
      WHERE a.is_hidden = false
      LIMIT 4
    `)).rows;
    assert.equal(supportingArticles.length, 4);
    const inserted = await getDb().pool.query<{ id: string }>(`
      INSERT INTO events (
        title, summary, finance_score, heat_score, first_seen_at, last_seen_at,
        article_count, source_count, status
      ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
      RETURNING id
    `, [
      `阶段10测试热点-${now.getTime()}`,
      '仅供阶段10 Web 集成测试使用的多信源事件。',
      99,
      99,
      now,
      supportingArticles.length,
      new Set(supportingArticles.map((row) => row.sourceId)).size,
      'developing',
    ]);
    testHotEventId = inserted.rows[0]?.id ?? '';
    assert.ok(testHotEventId);
    for (const { articleId } of supportingArticles) {
      await getDb().pool.query(`
        INSERT INTO event_articles (
          event_id, article_id, is_primary, similarity_score, confidence, cluster_method
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [testHotEventId, articleId, false, 1, 1, 'manual']);
    }
  });

  after(async () => {
    if (testHotEventId) {
      await getDb().pool.query('DELETE FROM event_articles WHERE event_id = $1', [testHotEventId]);
      await getDb().pool.query('DELETE FROM events WHERE id = $1', [testHotEventId]);
    }
    await getDb().pool.end();
  });

  test('新闻列表使用默认 limit 且返回统一成功体', async () => {
    const body = await read<List<News>>(await getNews(request('/news')));
    assert.equal(body.success, true);
    assert.equal(body.error, null);
    assert.ok(body.data && body.data.items.length > 0);
    assert.ok(body.data.items.length <= 20);
  });

  test('新闻 cursor 连续加载不重复', async () => {
    let cursor: string | null = null;
    const ids = new Set<string>();
    for (let page = 0; page < 20; page += 1) {
      const requestPath: string = cursor ? `/news?limit=3&cursor=${encodeURIComponent(cursor)}` : '/news?limit=3';
      const pageData: List<News> = await list<News>(getNews, requestPath);
      pageData.items.forEach((item: News) => {
        assert.equal(ids.has(item.id), false);
        ids.add(item.id);
      });
      if (!pageData.hasMore) break;
      assert.ok(pageData.nextCursor);
      cursor = pageData.nextCursor;
    }
    assert.ok(ids.size >= 3);
  });

  test('新闻组合筛选由数据库同时执行', async () => {
    const data = await list<News>(getNews, '/news?limit=10&market=us&category=monetary-policy&minScore=80&featured=true&event=linked');
    assert.ok(data.items.length > 0);
    data.items.forEach((item) => {
      assert.equal(item.market, 'us');
      assert.ok(item.score >= 80);
      assert.ok(item.event);
    });
  });

  test('新闻详情返回 Article 且事件关系来自 event 字段', async () => {
    const data = (await list<News>(getNews, '/news?limit=1')).items[0];
    const body = await read<News>(await getNewsDetail(request(`/news/${data.id}`), { params: Promise.resolve({ id: data.id }) }));
    assert.equal(body.success, true);
    assert.equal(body.data?.id, data.id);
  });

  test('standalone Article 不伪造 event_id 或事件关系', async () => {
    const data = await list<News>(getNews, '/news?limit=50&event=standalone');
    assert.ok(data.items.length > 0);
    data.items.forEach((item) => assert.equal(item.event, null));
  });

  test('非法新闻参数返回 400 且不泄露 SQL', async () => {
    const response = await getNews(request('/news?limit=0'));
    const body = await read<null>(response);
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
    assert.ok(body.error && !body.error.message.toLowerCase().includes('select'));
  });

  test('篡改 cursor 返回 400', async () => {
    const first = await list<News>(getNews, '/news?limit=1');
    assert.ok(first.nextCursor);
    const response = await getNews(request(`/news?limit=1&cursor=${encodeURIComponent(`${first.nextCursor}x`)}`));
    const body = await read<null>(response);
    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'INVALID_CURSOR');
  });

  test('不存在的新闻返回 404 统一错误体', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const response = await getNewsDetail(request(`/news/${id}`), { params: Promise.resolve({ id }) });
    const body = await read<null>(response);
    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  });

  test('事件列表返回统一分页体', async () => {
    const data = await list<{ id: string; title: string }>(getEvents, '/events?limit=5');
    assert.ok(data.items.length > 0);
  });

  test('事件详情批量返回多信源、计数、状态且按信源质量排序，不发生逐 Article N+1', async () => {
    resetQueryCount();
    const response = await getEventDetail(request(`/events/${testHotEventId}`), { params: Promise.resolve({ id: testHotEventId }) });
    const body = await read<Event>(response);
    assert.equal(response.status, 200);
    assert.ok(body.data);
    assert.equal(body.data!.status, 'developing');
    assert.equal(body.data!.articleCount, body.data!.articles.length);
    assert.equal(body.data!.sourceCount, new Set(body.data!.articles.map((article) => article.source.id)).size);
    const rank = (level: string) => ({ A: 0, B: 1, C: 2, D: 3, E: 4 }[level] ?? 5);
    for (let index = 1; index < body.data!.articles.length; index += 1) {
      const previous = body.data!.articles[index - 1]!;
      const current = body.data!.articles[index]!;
      assert.ok(rank(previous.source.sourceLevel) < rank(current.source.sourceLevel)
        || (rank(previous.source.sourceLevel) === rank(current.source.sourceLevel)
          && (previous.source.credibilityScore ?? -1) >= (current.source.credibilityScore ?? -1)));
    }
    assert.ok(getQueryCount() <= 3);
  });

  test('不存在的事件返回 404', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const response = await getEventDetail(request(`/events/${id}`), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 404);
  });

  test('热点榜只接受规定时间窗口', async () => {
    const data = await list<{ id: string; heatScore: number | null }>(getHot, '/hot?window=24h&limit=5');
    assert.ok(data.items.length > 0);
    const invalid = await getHot(request('/hot?window=2h'));
    assert.equal(invalid.status, 400);
  });

  test('热点榜 cursor 可验证且不重复', async () => {
    const first = await list<{ id: string }>(getHot, '/hot?window=7d&limit=2');
    if (!first.hasMore) return;
    assert.ok(first.nextCursor);
    const second = await list<{ id: string }>(getHot, `/hot?window=7d&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`);
    assert.ok(!first.items.some((one) => second.items.some((two) => one.id === two.id)));
  });

  test('日报从 daily_reports 返回', async () => {
    const response = await getDaily(request('/daily'));
    const body = await read<{ date: string; relatedEvents: unknown[] }>(response);
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data?.date);
  });

  test('主题列表从 topics 返回', async () => {
    const data = await list<Topic>(getTopics, '/topics?limit=5');
    assert.ok(data.items.length > 0);
    assert.ok(data.items[0].slug);
  });

  test('主题详情按 slug 批量返回事件和新闻', async () => {
    const topic = (await list<Topic>(getTopics, '/topics?limit=1')).items[0];
    const response = await getTopicDetail(request(`/topics/${topic.slug}`), { params: Promise.resolve({ id: topic.slug }) });
    const body = await read<{ id: string; events: unknown[]; articles: unknown[] }>(response);
    assert.equal(response.status, 200);
    assert.equal(body.data?.id, topic.id);
    assert.ok(body.data && body.data.events.length > 0 && body.data.articles.length > 0);
  });

  test('不存在的主题返回 404', async () => {
    const response = await getTopicDetail(request('/topics/not-found-topic'), { params: Promise.resolve({ id: 'not-found-topic' }) });
    assert.equal(response.status, 404);
  });

  test('中文搜索命中标题或关联事件/主题内容', async () => {
    const data = await list<News>(getSearch, '/search?q=%E7%BE%8E%E8%81%94%E5%82%A8&limit=10');
    assert.ok(data.items.length > 0);
    assert.ok(data.items.some((item) => item.title.includes('美联储')));
  });

  test('搜索空词返回 400', async () => {
    const response = await getSearch(request('/search?q='));
    const body = await read<null>(response);
    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'INVALID_PARAMETERS');
  });

  test('搜索与组合筛选可同时生效', async () => {
    const data = await list<News>(getSearch, '/search?q=%E5%A4%AE%E8%A1%8C&market=china&minScore=80&limit=10');
    data.items.forEach((item) => {
      assert.equal(item.market, 'china');
      assert.ok(item.score >= 80);
    });
  });
});
