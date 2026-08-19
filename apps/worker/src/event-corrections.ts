import { ai_tasks, articles, event_articles, event_timeline, events } from '@financehot/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { EVENT_MUTATION_LOCK_KEY, recomputeEventFacts, type WorkerDb, type WorkerTransaction } from './event-facts';

function uniqueIds(values: readonly string[]) {
  return [...new Set(values)];
}

async function lockEvents(tx: WorkerTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(${EVENT_MUTATION_LOCK_KEY})`);
}

export interface MergeEventsInput {
  sourceEventId: string;
  targetEventId: string;
  now?: Date;
}

export interface MergeEventsResult {
  targetEventId: string;
  sourceEventId: string;
  idempotent: boolean;
  articleCount: number;
  sourceCount: number;
}

export async function mergeEvents(db: WorkerDb, input: MergeEventsInput): Promise<MergeEventsResult> {
  if (input.sourceEventId === input.targetEventId) throw new Error('不能把 Event 合并到自身');
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await lockEvents(tx);
    const target = (await tx.select({ id: events.id }).from(events).where(eq(events.id, input.targetEventId)).limit(1))[0];
    if (!target) throw new Error(`目标 Event 不存在: ${input.targetEventId}`);
    const source = (await tx.select({ id: events.id }).from(events).where(eq(events.id, input.sourceEventId)).limit(1))[0];
    if (!source) {
      const facts = await recomputeEventFacts(tx, input.targetEventId, now);
      return { targetEventId: input.targetEventId, sourceEventId: input.sourceEventId, idempotent: true, articleCount: facts.articleCount, sourceCount: facts.sourceCount };
    }

    const sourceRelations = await tx.select().from(event_articles).where(eq(event_articles.event_id, input.sourceEventId));
    const targetRelations = await tx.select({ articleId: event_articles.article_id }).from(event_articles).where(eq(event_articles.event_id, input.targetEventId));
    const targetArticleIds = new Set(targetRelations.map((row) => row.articleId));
    await tx.update(event_articles).set({ is_primary: false }).where(eq(event_articles.event_id, input.targetEventId));
    for (const relation of sourceRelations) {
      if (targetArticleIds.has(relation.article_id)) continue;
      await tx.insert(event_articles).values({
        event_id: input.targetEventId,
        article_id: relation.article_id,
        is_primary: false,
        similarity_score: relation.similarity_score,
        confidence: relation.confidence,
        cluster_method: relation.cluster_method,
        created_at: relation.created_at,
      }).onConflictDoNothing();
    }
    await tx.delete(event_articles).where(eq(event_articles.event_id, input.sourceEventId));
    await tx.execute(sql`
      DELETE FROM event_topics old
      WHERE old.event_id = ${input.sourceEventId}::uuid
        AND EXISTS (
          SELECT 1 FROM event_topics current
          WHERE current.event_id = ${input.targetEventId}::uuid
            AND current.topic_id = old.topic_id
        )
    `);
    await tx.execute(sql`UPDATE event_topics SET event_id = ${input.targetEventId}::uuid WHERE event_id = ${input.sourceEventId}::uuid`);
    await tx.update(event_timeline).set({ event_id: input.targetEventId, updated_at: now }).where(eq(event_timeline.event_id, input.sourceEventId));
    await tx.update(ai_tasks).set({ event_id: input.targetEventId, updated_at: now }).where(eq(ai_tasks.event_id, input.sourceEventId));
    await tx.delete(events).where(eq(events.id, input.sourceEventId));
    const facts = await recomputeEventFacts(tx, input.targetEventId, now);
    return { targetEventId: input.targetEventId, sourceEventId: input.sourceEventId, idempotent: false, articleCount: facts.articleCount, sourceCount: facts.sourceCount };
  });
}

export interface SplitEventInput {
  eventId: string;
  articleIds: readonly string[];
  now?: Date;
}

export interface SplitEventResult {
  originalEventId: string;
  newEventId: string;
  articleCount: number;
  sourceCount: number;
  idempotent: boolean;
}

export async function splitEvent(db: WorkerDb, input: SplitEventInput): Promise<SplitEventResult> {
  const requested = uniqueIds(input.articleIds);
  if (!requested.length || requested.length !== input.articleIds.length) throw new Error('split 必须提供不重复的明确 Article 集合');
  const now = input.now ?? new Date();
  const splitKey = `split:${input.eventId}:${[...requested].sort().join(',')}`;
  return db.transaction(async (tx) => {
    await lockEvents(tx);
    const event = (await tx.select().from(events).where(eq(events.id, input.eventId)).limit(1))[0];
    if (!event) throw new Error(`待拆分 Event 不存在: ${input.eventId}`);
    const relations = await tx.select().from(event_articles).where(eq(event_articles.event_id, input.eventId));
    const memberIds = new Set(relations.map((row) => row.article_id));
    const existingSplit = (await tx.select({ id: events.id }).from(events).where(eq(events.slug, splitKey)).limit(1))[0];
    if (existingSplit) {
      const existingRelations = await tx.select().from(event_articles).where(eq(event_articles.event_id, existingSplit.id));
      if (existingRelations.length !== requested.length || existingRelations.some((row) => !requested.includes(row.article_id))) {
        throw new Error('split 幂等键对应的 Event 成员已不一致');
      }
      const facts = await recomputeEventFacts(tx, existingSplit.id, now);
      return { originalEventId: input.eventId, newEventId: existingSplit.id, articleCount: facts.articleCount, sourceCount: facts.sourceCount, idempotent: true };
    }
    if (requested.some((id) => !memberIds.has(id))) throw new Error('split 的 Article 必须全部属于指定 Event，不能静默丢失');
    if (requested.length >= relations.length) throw new Error('split 至少要为原 Event 保留一篇 Article');
    const selectedRelations = await tx.select({ eventId: event_articles.event_id, articleId: event_articles.article_id })
      .from(event_articles).where(inArray(event_articles.article_id, requested));
    if (selectedRelations.some((row) => row.eventId !== input.eventId)) throw new Error('split 的 Article 已属于其他 Event');

    const selectedArticles = await tx.select().from(articles).where(inArray(articles.id, requested));
    if (selectedArticles.length !== requested.length) throw new Error('split 的 Article 不存在');
    const inserted = (await tx.insert(events).values({
      slug: splitKey,
      title: selectedArticles[0]?.title_zh ?? selectedArticles[0]?.original_title ?? input.eventId,
      summary: selectedArticles[0]?.summary_zh ?? selectedArticles[0]?.original_summary ?? null,
      first_seen_at: null,
      last_seen_at: null,
      article_count: 0,
      source_count: 0,
      status: event.status,
    }).returning({ id: events.id }))[0];
    if (!inserted) throw new Error('创建 split Event 失败');
    await tx.insert(event_articles).values(relations.filter((row) => requested.includes(row.article_id)).map((row) => ({
      event_id: inserted.id,
      article_id: row.article_id,
      is_primary: false,
      similarity_score: row.similarity_score,
      confidence: row.confidence,
      cluster_method: row.cluster_method,
      created_at: row.created_at,
    })));
    await tx.delete(event_articles).where(and(eq(event_articles.event_id, input.eventId), inArray(event_articles.article_id, requested)));
    await recomputeEventFacts(tx, input.eventId, now);
    const newFacts = await recomputeEventFacts(tx, inserted.id, now);
    return {
      originalEventId: input.eventId,
      newEventId: inserted.id,
      articleCount: newFacts.articleCount,
      sourceCount: newFacts.sourceCount,
      idempotent: false,
    };
  });
}
