import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import {
  AppError,
  dailyReportSchema,
  dailyQuerySchema,
  eventDetailSchema,
  eventSummarySchema,
  eventQuerySchema,
  hotQuerySchema,
  newsItemSchema,
  newsQuerySchema,
  searchQuerySchema,
  topicDetailSchema,
  topicIdSchema,
  topicQuerySchema,
  topicSummarySchema,
  type DailyQuery,
  type DailyReport,
  type EventDetail,
  type EventQuery,
  type EventSummary,
  type HomeData,
  type HotQuery,
  type Market,
  type NewsItem,
  type NewsQuery,
  type SearchQuery,
  type TopicDetail,
  type TopicQuery,
  type TopicSummary,
} from '@financehot/shared';
import type { Db } from '../client';

export type QueryDb = Db['db'];

export type ListData<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

let queryCount = 0;

export function resetQueryCount() {
  queryCount = 0;
}

export function getQueryCount() {
  return queryCount;
}

async function execute<T>(db: QueryDb, statement: SQL): Promise<T[]> {
  queryCount += 1;
  const result = await db.execute(statement);
  return result.rows as T[];
}

type CursorKind = 'news' | 'search' | 'events' | 'hot' | 'topics';
type CursorPayload = { v: 1; kind: CursorKind; key: string | number | null; id: string };

const cursorSecret = () => process.env.FINANCEHOT_CURSOR_SECRET ?? 'financehot-stage-05-cursor';

function encodeCursor(kind: CursorKind, key: string | number | null, id: string): string {
  const payload: CursorPayload = { v: 1, kind, key, id };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', cursorSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function decodeCursor(cursor: string | undefined, kind: CursorKind): CursorPayload | null {
  if (!cursor) return null;
  const [encoded, signature] = cursor.split('.');
  if (!encoded || !signature) throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);

  const expected = createHmac('sha256', cursorSecret()).update(encoded).digest('base64url');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CursorPayload;
    if (
      payload.v !== 1 ||
      payload.kind !== kind ||
      typeof payload.id !== 'string' ||
      (typeof payload.key !== 'string' && typeof payload.key !== 'number' && payload.key !== null)
    ) {
      throw new Error('invalid payload');
    }
    return payload;
  } catch {
    throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
  }
}

function asDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function dateIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function jsonValue<T>(value: unknown): T {
  return value as T;
}

function ensureUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError('资源 ID 无效', 'INVALID_ID', 400);
  }
}

function codeList(codes: string[]) {
  return sql.join(codes.map((code) => sql`${code}`), sql`, `);
}

function marketCodes(market: Market): SQL {
  if (market === 'china') return sql`c.code IN (${codeList(['CN', 'HK'])})`;
  if (market === 'us') return sql`c.code IN (${codeList(['US'])})`;
  if (market === 'europe') return sql`c.code IN (${codeList(['DE', 'FR', 'GB'])})`;
  if (market === 'japan') return sql`c.code IN (${codeList(['JP'])})`;
  return sql`c.code NOT IN (${codeList(['CN', 'HK', 'US', 'DE', 'FR', 'GB', 'JP'])})`;
}

const directArticleSearchDocument = sql`
  concat_ws(' ',
    coalesce(a.title_zh, ''), coalesce(a.original_title, ''),
    coalesce(a.summary_zh, ''), coalesce(a.original_summary, ''),
    coalesce(s.name, '')
  )
`;

const articleJoins = sql`
  JOIN sources s ON s.id = a.source_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object('slug', ca.slug, 'name', ca.name) AS value
    FROM article_categories ac JOIN categories ca ON ca.id = ac.category_id
    WHERE ac.article_id = a.id
    ORDER BY ca.sort_order ASC, ca.id ASC
    LIMIT 1
  ) category_value ON TRUE
  LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name_zh) ORDER BY c.code), '[]'::jsonb) AS value
    FROM article_countries ac JOIN countries c ON c.id = ac.country_id
    WHERE ac.article_id = a.id
  ) country_value ON TRUE
  LEFT JOIN LATERAL (
    SELECT coalesce(jsonb_agg(t.name ORDER BY t.name), '[]'::jsonb) AS value
    FROM article_tags at JOIN tags t ON t.id = at.tag_id
    WHERE at.article_id = a.id
  ) tag_value ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', e.id, 'title', e.title, 'summary', e.summary,
      'financeScore', e.finance_score, 'heatScore', e.heat_score,
      'status', e.status, 'articleCount', e.article_count, 'sourceCount', e.source_count
    ) AS value
    FROM event_articles ea JOIN events e ON e.id = ea.event_id
    WHERE ea.article_id = a.id
    ORDER BY ea.is_primary DESC, e.last_seen_at DESC NULLS LAST, e.id DESC
    LIMIT 1
  ) event_value ON TRUE
`;

const articleJsonValue = sql`jsonb_build_object(
  'id', a.id,
  'title', coalesce(a.title_zh, a.original_title, ''),
  'summary', coalesce(a.summary_zh, a.original_summary, ''),
  'publishedAt', a.published_at,
  'source', jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'country', s.country,
    'sourceLevel', s.source_level,
    'credibilityScore', s.credibility_score
  ),
  'score', coalesce(a.finance_score, 0),
  'financeScore', a.finance_score,
  'marketImpactScore', a.market_impact_score,
  'featured', a.is_featured,
  'market', coalesce((SELECT CASE
    WHEN c.code IN ('CN', 'HK') THEN 'china'
    WHEN c.code = 'US' THEN 'us'
    WHEN c.code IN ('DE', 'FR', 'GB') THEN 'europe'
    WHEN c.code = 'JP' THEN 'japan'
    ELSE 'global'
  END FROM article_countries ac JOIN countries c ON c.id = ac.country_id
  WHERE ac.article_id = a.id
  ORDER BY CASE WHEN ac.role = 'primary' THEN 0 ELSE 1 END, c.code
  LIMIT 1), 'global'),
  'countries', country_value.value,
  'category', category_value.value,
  'tags', tag_value.value,
  'event', event_value.value,
  'relatedSources', greatest(coalesce((event_value.value->>'sourceCount')::int, 1) - 1, 0),
  'reason', a.ai_reason
)`;

type ArticleRow = { value: unknown; cursor_value: unknown };

function articleConditions(
  query: NewsQuery | SearchQuery,
  cursor: CursorPayload | null,
  extra: SQL[] = [],
): SQL {
  const conditions: SQL[] = [sql`a.is_hidden = false`];
  const from = asDate(query.from);
  const to = asDate(query.to, true);
  if (from) conditions.push(sql`a.published_at >= ${from}`);
  if (to) conditions.push(sql`a.published_at < ${to}`);
  if (query.market) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM article_countries acm JOIN countries c ON c.id = acm.country_id
      WHERE acm.article_id = a.id AND ${marketCodes(query.market)}
    )`);
  }
  if (query.category) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM article_categories acm JOIN categories cm ON cm.id = acm.category_id
      WHERE acm.article_id = a.id AND cm.slug = ${query.category}
    )`);
  }
  if (query.country) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM article_countries acc JOIN countries cc ON cc.id = acc.country_id
      WHERE acc.article_id = a.id AND cc.code = ${query.country}
    )`);
  }
  if (query.source) {
    conditions.push(sql`(s.name = ${query.source} OR s.id::text = ${query.source})`);
  }
  if (query.minScore !== undefined) conditions.push(sql`coalesce(a.finance_score, 0) >= ${query.minScore}`);
  if (query.featured !== undefined) conditions.push(sql`a.is_featured = ${query.featured}`);
  if (query.event === 'linked') {
    conditions.push(sql`EXISTS (SELECT 1 FROM event_articles eaf WHERE eaf.article_id = a.id)`);
  } else if (query.event === 'standalone') {
    conditions.push(sql`NOT EXISTS (SELECT 1 FROM event_articles eaf WHERE eaf.article_id = a.id)`);
  } else if (query.event) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM event_articles eaf
      WHERE eaf.article_id = a.id AND eaf.event_id = ${query.event}::uuid
    )`);
  }
  if (cursor) {
    if (cursor.key === null) {
      conditions.push(sql`a.published_at IS NULL AND a.id < ${cursor.id}::uuid`);
    } else if (typeof cursor.key === 'string' && !Number.isNaN(Date.parse(cursor.key))) {
      const publishedAt = new Date(cursor.key);
      conditions.push(sql`(
        a.published_at < ${publishedAt}
        OR (a.published_at = ${publishedAt} AND a.id < ${cursor.id}::uuid)
        OR a.published_at IS NULL
      )`);
    } else {
      throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
    }
  }
  conditions.push(...extra);
  return sql.join(conditions, sql` AND `);
}

function parseNewsRows(rows: ArticleRow[]): NewsItem[] {
  return rows.map((row) => newsItemSchema.parse(jsonValue(row.value)));
}

export async function listNews(db: QueryDb, input: NewsQuery | SearchQuery): Promise<ListData<NewsItem>> {
  const query = 'q' in input ? searchQuerySchema.parse(input) : newsQuerySchema.parse(input);
  const kind: CursorKind = 'q' in query ? 'search' : 'news';
  const cursor = decodeCursor(query.cursor, kind);
  const searchJoin = 'q' in query
    ? sql`CROSS JOIN LATERAL (SELECT ${directArticleSearchDocument} AS value) search_document`
    : sql``;
  const searchCondition = 'q' in query
    ? [sql`(
      search_document.value ILIKE '%' || ${query.q} || '%'
      OR to_tsvector('simple', search_document.value) @@ plainto_tsquery('simple', ${query.q})
      OR similarity(search_document.value, ${query.q}) > 0.05
      OR EXISTS (
        SELECT 1 FROM article_countries ac JOIN countries c ON c.id = ac.country_id
        WHERE ac.article_id = a.id
          AND (c.name_zh ILIKE '%' || ${query.q} || '%' OR c.name_en ILIKE '%' || ${query.q} || '%' OR c.code ILIKE '%' || ${query.q} || '%')
      )
      OR EXISTS (
        SELECT 1 FROM article_categories ac JOIN categories c ON c.id = ac.category_id
        WHERE ac.article_id = a.id AND c.name ILIKE '%' || ${query.q} || '%'
      )
      OR EXISTS (
        SELECT 1 FROM article_tags at JOIN tags t ON t.id = at.tag_id
        WHERE at.article_id = a.id AND (t.name ILIKE '%' || ${query.q} || '%' OR t.slug ILIKE '%' || ${query.q} || '%')
      )
      OR EXISTS (
        SELECT 1 FROM event_articles ea JOIN events e ON e.id = ea.event_id
        WHERE ea.article_id = a.id
          AND (e.title ILIKE '%' || ${query.q} || '%' OR e.summary ILIKE '%' || ${query.q} || '%')
      )
      OR EXISTS (
        SELECT 1 FROM topic_articles ta JOIN topics t ON t.id = ta.topic_id
        WHERE ta.article_id = a.id
          AND (t.name ILIKE '%' || ${query.q} || '%' OR t.description ILIKE '%' || ${query.q} || '%')
      )
    )`]
    : [];
  const where = articleConditions(query, cursor, searchCondition);
  const rows = await execute<ArticleRow>(db, sql`
    SELECT ${articleJsonValue} AS value, a.published_at AS cursor_value
    FROM articles a
    ${articleJoins}
    ${searchJoin}
    WHERE ${where}
    ORDER BY a.published_at DESC NULLS LAST, a.id DESC
    LIMIT ${query.limit + 1}
  `);
  const hasMore = rows.length > query.limit;
  const visibleRows = rows.slice(0, query.limit);
  const items = parseNewsRows(visibleRows);
  const last = visibleRows.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(kind, dateIso(last.cursor_value), items.at(-1)!.id) : null,
  };
}

type EventRow = { value: unknown; cursor_value: unknown };

const eventJsonValue = sql`jsonb_build_object(
  'id', e.id,
  'title', e.title,
  'summary', e.summary,
  'financeScore', e.finance_score,
  'heatScore', e.heat_score,
  'status', e.status,
  'firstSeenAt', e.first_seen_at,
  'lastSeenAt', e.last_seen_at,
  'articleCount', e.article_count,
  'sourceCount', e.source_count
)`;

function parseEventRows(rows: EventRow[]): EventSummary[] {
  return rows.map((row) => eventSummarySchema.parse(jsonValue(row.value)));
}

async function listEventsInternal(
  db: QueryDb,
  input: EventQuery | HotQuery,
  mode: 'events' | 'hot',
  extra: SQL[] = [],
): Promise<ListData<EventSummary>> {
  const query = mode === 'hot' ? hotQuerySchema.parse(input) : eventQuerySchema.parse(input);
  const cursor = decodeCursor(query.cursor, mode);
  const conditions: SQL[] = [...extra];
  if ('minScore' in query && query.minScore !== undefined) {
    conditions.push(sql`coalesce(e.finance_score, 0) >= ${query.minScore}`);
  }
  if ('status' in query && query.status) conditions.push(sql`e.status = ${query.status}`);
  if (mode === 'hot') {
    const hotQuery = query as HotQuery;
    const seconds = ({ '1h': 3600, '3h': 10800, '6h': 21600, '12h': 43200, '24h': 86400, '7d': 604800 } as const)[hotQuery.window];
    conditions.push(sql`coalesce(e.last_seen_at, e.first_seen_at) >= now() - (${seconds} * interval '1 second')`);
    if (cursor) {
      if (cursor.key === null) {
        conditions.push(sql`e.heat_score IS NULL AND e.id < ${cursor.id}::uuid`);
      } else if (typeof cursor.key === 'number') {
        conditions.push(sql`(
          e.heat_score < ${cursor.key}
          OR (e.heat_score = ${cursor.key} AND e.id < ${cursor.id}::uuid)
          OR e.heat_score IS NULL
        )`);
      } else {
        throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
      }
    }
  } else {
    if (cursor) {
      if (cursor.key === null) {
        conditions.push(sql`e.last_seen_at IS NULL AND e.id < ${cursor.id}::uuid`);
      } else if (typeof cursor.key === 'string' && !Number.isNaN(Date.parse(cursor.key))) {
        const lastSeenAt = new Date(cursor.key);
        conditions.push(sql`(
          e.last_seen_at < ${lastSeenAt}
          OR (e.last_seen_at = ${lastSeenAt} AND e.id < ${cursor.id}::uuid)
          OR e.last_seen_at IS NULL
        )`);
      } else {
        throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
      }
    }
  }
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const order = mode === 'hot'
    ? sql`ORDER BY e.heat_score DESC NULLS LAST, e.id DESC`
    : sql`ORDER BY e.last_seen_at DESC NULLS LAST, e.id DESC`;
  const rows = await execute<EventRow>(db, sql`
    SELECT ${eventJsonValue} AS value,
      ${mode === 'hot' ? sql`e.heat_score` : sql`e.last_seen_at`} AS cursor_value
    FROM events e
    ${where}
    ${order}
    LIMIT ${query.limit + 1}
  `);
  const hasMore = rows.length > query.limit;
  const visibleRows = rows.slice(0, query.limit);
  const items = parseEventRows(visibleRows);
  const last = visibleRows.at(-1);
  const lastItem = items.at(-1);
  const key = mode === 'hot' ? numberOrNull(last?.cursor_value) : dateIso(last?.cursor_value);
  return { items, hasMore, nextCursor: hasMore && lastItem ? encodeCursor(mode, key, lastItem.id) : null };
}

export async function listEvents(db: QueryDb, input: EventQuery): Promise<ListData<EventSummary>> {
  return listEventsInternal(db, input, 'events');
}

export async function listHotEvents(db: QueryDb, input: HotQuery): Promise<ListData<EventSummary>> {
  return listEventsInternal(db, input, 'hot');
}

export async function getNews(db: QueryDb, id: string): Promise<NewsItem | null> {
  ensureUuid(id);
  const rows = await execute<ArticleRow>(db, sql`
    SELECT ${articleJsonValue} AS value, a.published_at AS cursor_value
    FROM articles a
    ${articleJoins}
    WHERE a.id = ${id}::uuid AND a.is_hidden = false
    LIMIT 1
  `);
  return rows.length ? newsItemSchema.parse(jsonValue(rows[0].value)) : null;
}

export async function getEvent(db: QueryDb, id: string): Promise<EventDetail | null> {
  ensureUuid(id);
  const eventRows = await execute<EventRow>(db, sql`
    SELECT ${eventJsonValue} AS value, e.last_seen_at AS cursor_value
    FROM events e WHERE e.id = ${id}::uuid LIMIT 1
  `);
  if (!eventRows.length) return null;

  const [articleRows, timelineRows] = await Promise.all([
    execute<ArticleRow>(db, sql`
      SELECT ${articleJsonValue} AS value, a.published_at AS cursor_value
      FROM articles a
      ${articleJoins}
      WHERE a.is_hidden = false
        AND EXISTS (SELECT 1 FROM event_articles ea WHERE ea.event_id = ${id}::uuid AND ea.article_id = a.id)
      ORDER BY CASE s.source_level
        WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 WHEN 'E' THEN 4 ELSE 5 END ASC,
        s.credibility_score DESC NULLS LAST,
        a.published_at DESC NULLS LAST,
        a.id DESC
      LIMIT 50
    `),
    execute<{ value: unknown }>(db, sql`
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', et.id, 'occurredAt', et.occurred_at, 'type', et.type,
        'description', et.description, 'sourceArticleId', et.source_article_id
      ) ORDER BY et.occurred_at ASC, et.id ASC), '[]'::jsonb) AS value
      FROM event_timeline et WHERE et.event_id = ${id}::uuid
    `),
  ]);
  const event = eventSummarySchema.parse(jsonValue(eventRows[0].value));
  const detail = {
    ...event,
    articles: parseNewsRows(articleRows),
    timeline: jsonValue<unknown[]>(timelineRows[0]?.value ?? []),
  };
  return eventDetailSchema.parse(detail);
}

async function getTopicRow(db: QueryDb, idOrSlug: string): Promise<TopicSummary | null> {
  const parsed = topicIdSchema.safeParse(idOrSlug);
  if (!parsed.success) throw new AppError('主题 ID 无效', 'INVALID_ID', 400);
  const value = parsed.data;
  const condition = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? sql`t.id = ${value}::uuid`
    : sql`t.slug = ${value}`;
  const rows = await execute<{ value: unknown }>(db, sql`
    SELECT jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'description', t.description,
      'heatScore', t.heat_score,
      'eventCount', (SELECT count(*)::int FROM event_topics et WHERE et.topic_id = t.id),
      'newsCount24h', (SELECT count(*)::int FROM topic_articles ta JOIN articles a ON a.id = ta.article_id
        WHERE ta.topic_id = t.id AND a.is_hidden = false AND a.published_at >= now() - interval '24 hours'),
      'markets', coalesce((SELECT jsonb_agg(x.market ORDER BY x.market) FROM (
        SELECT DISTINCT CASE
          WHEN c.code IN ('CN', 'HK') THEN '中国'
          WHEN c.code = 'US' THEN '美国'
          WHEN c.code IN ('DE', 'FR', 'GB') THEN '欧洲'
          WHEN c.code = 'JP' THEN '日本'
          ELSE '全球'
        END AS market
        FROM topic_articles ta JOIN article_countries ac ON ac.article_id = ta.article_id
        JOIN countries c ON c.id = ac.country_id WHERE ta.topic_id = t.id
      ) x), '[]'::jsonb),
      'categories', coalesce((SELECT jsonb_agg(x.name ORDER BY x.name) FROM (
        SELECT DISTINCT ca.name
        FROM topic_articles ta JOIN article_categories ac ON ac.article_id = ta.article_id
        JOIN categories ca ON ca.id = ac.category_id WHERE ta.topic_id = t.id
      ) x), '[]'::jsonb)
    ) AS value
    FROM topics t WHERE ${condition} LIMIT 1
  `);
  return rows.length ? topicSummarySchema.parse(jsonValue(rows[0].value)) : null;
}

export async function listTopics(db: QueryDb, input: TopicQuery): Promise<ListData<TopicSummary>> {
  const query = topicQuerySchema.parse(input);
  const cursor = decodeCursor(query.cursor, 'topics');
  const conditions: SQL[] = [];
  if (cursor) {
    if (cursor.key === null) {
      conditions.push(sql`t.heat_score IS NULL AND t.id < ${cursor.id}::uuid`);
    } else if (typeof cursor.key === 'number') {
      conditions.push(sql`(
        t.heat_score < ${cursor.key}
        OR (t.heat_score = ${cursor.key} AND t.id < ${cursor.id}::uuid)
        OR t.heat_score IS NULL
      )`);
    } else {
      throw new AppError('cursor 无效', 'INVALID_CURSOR', 400);
    }
  }
  const rows = await execute<{ value: unknown }>(db, sql`
    SELECT jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'description', t.description,
      'heatScore', t.heat_score,
      'eventCount', (SELECT count(*)::int FROM event_topics et WHERE et.topic_id = t.id),
      'newsCount24h', (SELECT count(*)::int FROM topic_articles ta JOIN articles a ON a.id = ta.article_id
        WHERE ta.topic_id = t.id AND a.is_hidden = false AND a.published_at >= now() - interval '24 hours'),
      'markets', '[]'::jsonb, 'categories', '[]'::jsonb
    ) AS value
    FROM topics t
    ${conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
    ORDER BY t.heat_score DESC NULLS LAST, t.id DESC LIMIT ${query.limit + 1}
  `);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map((row) => topicSummarySchema.parse(jsonValue(row.value)));
  const last = items.at(-1);
  return { items, hasMore, nextCursor: hasMore && last ? encodeCursor('topics', last.heatScore, last.id) : null };
}

export async function getTopic(db: QueryDb, idOrSlug: string): Promise<TopicDetail | null> {
  const topic = await getTopicRow(db, idOrSlug);
  if (!topic) return null;
  const [eventRows, articleRows] = await Promise.all([
    execute<EventRow>(db, sql`
      SELECT ${eventJsonValue} AS value, e.last_seen_at AS cursor_value
      FROM events e JOIN event_topics et ON et.event_id = e.id
      WHERE et.topic_id = ${topic.id}::uuid
      ORDER BY e.heat_score DESC NULLS LAST, e.last_seen_at DESC NULLS LAST, e.id DESC
      LIMIT 50
    `),
    execute<ArticleRow>(db, sql`
      SELECT ${articleJsonValue} AS value, a.published_at AS cursor_value
      FROM articles a
      ${articleJoins}
      WHERE a.is_hidden = false AND EXISTS (
        SELECT 1 FROM topic_articles ta WHERE ta.topic_id = ${topic.id}::uuid AND ta.article_id = a.id
      )
      ORDER BY a.published_at DESC NULLS LAST, a.id DESC
      LIMIT 50
    `),
  ]);
  return topicDetailSchema.parse({
    ...topic,
    events: parseEventRows(eventRows),
    articles: parseNewsRows(articleRows),
  });
}

function reportContent(value: unknown) {
  const content = (value ?? {}) as Record<string, unknown>;
  const topItems = Array.isArray(content.topItems)
    ? content.topItems.filter((item): item is { title: string; score: number } => {
      const candidate = item as Record<string, unknown>;
      return typeof candidate?.title === 'string' && typeof candidate?.score === 'number';
    })
    : [];
  const sections = Array.isArray(content.sections)
    ? content.sections.filter((item): item is { name: string; items: string[] } => {
      const candidate = item as Record<string, unknown>;
      return typeof candidate?.name === 'string' && Array.isArray(candidate?.items);
    })
    : [];
  return {
    summary: typeof content.summary === 'string' ? content.summary.replace(/^\[Demo\]\s*/, '') : '',
    topItems,
    sections,
  };
}

export async function getDaily(db: QueryDb, input: DailyQuery): Promise<DailyReport | null> {
  const query = input as DailyQuery;
  const [reportRows, eventRows] = await Promise.all([
    execute<{ id: string; date: string; timezone: string; model: string | null; prompt_version: string | null; content_json: unknown }>(db, sql`
      SELECT id, date::text, timezone, model, prompt_version, content_json
      FROM daily_reports
      ${query.date ? sql`WHERE date = ${query.date}::date` : sql``}
      ORDER BY date DESC, id DESC LIMIT 1
    `),
    execute<EventRow>(db, sql`
      SELECT ${eventJsonValue} AS value, e.last_seen_at AS cursor_value
      FROM events e ORDER BY e.heat_score DESC NULLS LAST, e.last_seen_at DESC NULLS LAST, e.id DESC LIMIT 3
    `),
  ]);
  if (!reportRows.length) return null;
  const report = reportRows[0];
  const content = reportContent(report.content_json);
  return dailyReportSchema.parse({
    id: report.id,
    date: report.date,
    timezone: report.timezone,
    model: report.model,
    promptVersion: report.prompt_version,
    ...content,
    relatedEvents: parseEventRows(eventRows),
  });
}

export async function getHomeData(db: QueryDb): Promise<HomeData> {
  const [statsRows, hot, news] = await Promise.all([
    execute<{ collected: number; events: number; featured: number; major_events: number }>(db, sql`
      SELECT
        (SELECT count(*)::int FROM articles WHERE is_hidden = false) AS collected,
        (SELECT count(*)::int FROM events) AS events,
        (SELECT count(*)::int FROM articles WHERE is_hidden = false AND is_featured = true) AS featured,
        (SELECT count(*)::int FROM events WHERE finance_score >= 90) AS major_events
    `),
    listHotEvents(db, { limit: 5, window: '7d' }),
    listNews(db, { limit: 30 }),
  ]);
  const stats = statsRows[0];
  return {
    stats: {
      collected: Number(stats?.collected ?? 0),
      events: Number(stats?.events ?? 0),
      featured: Number(stats?.featured ?? 0),
      majorEvents: Number(stats?.major_events ?? 0),
    },
    hot,
    news,
  };
}

export function parseNewsQuery(params: URLSearchParams): NewsQuery {
  return newsQuerySchema.parse(Object.fromEntries(params.entries()));
}

export function parseSearchQuery(params: URLSearchParams): SearchQuery {
  return searchQuerySchema.parse(Object.fromEntries(params.entries()));
}

export function parseEventQuery(params: URLSearchParams): EventQuery {
  return eventQuerySchema.parse(Object.fromEntries(params.entries()));
}

export function parseHotQuery(params: URLSearchParams): HotQuery {
  return hotQuerySchema.parse(Object.fromEntries(params.entries()));
}

export function parseTopicQuery(params: URLSearchParams): TopicQuery {
  return topicQuerySchema.parse(Object.fromEntries(params.entries()));
}

export function parseDailyQuery(params: URLSearchParams): DailyQuery {
  return dailyQuerySchema.parse({ date: params.get('date') ?? undefined });
}
