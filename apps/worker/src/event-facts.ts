import { articles, event_articles, events, sources, type Db } from '@financehot/db';
import { and, eq } from 'drizzle-orm';

export type WorkerDb = Db['db'];
export type WorkerTransaction = Parameters<WorkerDb['transaction']>[0] extends (tx: infer Tx) => Promise<unknown> ? Tx : never;

export const EVENT_MUTATION_LOCK_KEY = 90210;

const SOURCE_LEVEL_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export interface EventFactOverrides {
  title?: string;
  summary?: string | null;
}

type EventMember = {
  relationId: string;
  articleId: string;
  sourceId: string;
  title: string | null;
  originalTitle: string | null;
  summary: string | null;
  originalSummary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date | null;
  createdAt: Date;
  sourceLevel: string;
  credibilityScore: number | null;
  isPrimary: boolean;
  similarityScore: number | null;
  confidence: number | null;
};

function seenAt(member: Pick<EventMember, 'publishedAt' | 'fetchedAt' | 'createdAt'>) {
  return member.publishedAt ?? member.fetchedAt ?? member.createdAt;
}

function compareMembers(left: EventMember, right: EventMember) {
  const level = (SOURCE_LEVEL_RANK[left.sourceLevel] ?? 99) - (SOURCE_LEVEL_RANK[right.sourceLevel] ?? 99);
  if (level) return level;
  const credibility = (right.credibilityScore ?? -1) - (left.credibilityScore ?? -1);
  if (credibility) return credibility;
  const seen = seenAt(right).getTime() - seenAt(left).getTime();
  if (seen) return seen;
  return left.articleId.localeCompare(right.articleId);
}

export async function loadEventMembers(db: WorkerDb | WorkerTransaction, eventId: string): Promise<EventMember[]> {
  const rows = await db.select({
    relationId: event_articles.id,
    articleId: articles.id,
    sourceId: articles.source_id,
    title: articles.title_zh,
    originalTitle: articles.original_title,
    summary: articles.summary_zh,
    originalSummary: articles.original_summary,
    publishedAt: articles.published_at,
    fetchedAt: articles.fetched_at,
    createdAt: articles.created_at,
    sourceLevel: sources.source_level,
    credibilityScore: sources.credibility_score,
    isPrimary: event_articles.is_primary,
    similarityScore: event_articles.similarity_score,
    confidence: event_articles.confidence,
  }).from(event_articles)
    .innerJoin(articles, eq(articles.id, event_articles.article_id))
    .innerJoin(sources, eq(sources.id, articles.source_id))
    .where(eq(event_articles.event_id, eventId));
  return rows.sort(compareMembers);
}

function fallbackTitle(member: EventMember) {
  return member.title?.trim() || member.originalTitle?.trim() || member.articleId;
}

function fallbackSummary(member: EventMember) {
  return member.summary?.trim() || member.originalSummary?.trim() || null;
}

export async function recomputeEventFacts(
  tx: WorkerTransaction,
  eventId: string,
  now: Date,
  overrides: EventFactOverrides = {},
) {
  const members = await loadEventMembers(tx, eventId);
  if (!members.length) throw new Error(`Event 不得没有 Article 关系: ${eventId}`);
  const primary = members[0]!;
  const firstSeenAt = members.reduce((earliest, member) => {
    const value = seenAt(member);
    return value < earliest ? value : earliest;
  }, seenAt(members[0]!));
  const lastSeenAt = members.reduce((latest, member) => {
    const value = seenAt(member);
    return value > latest ? value : latest;
  }, seenAt(members[0]!));
  const sourceIds = new Set<string>();
  for (const member of members) sourceIds.add(member.sourceId);

  await tx.update(event_articles).set({ is_primary: false }).where(eq(event_articles.event_id, eventId));
  await tx.update(event_articles).set({ is_primary: true }).where(and(
    eq(event_articles.event_id, eventId),
    eq(event_articles.id, primary.relationId),
  ));
  await tx.update(events).set({
    title: overrides.title?.trim() || fallbackTitle(primary),
    summary: overrides.summary === undefined ? fallbackSummary(primary) : overrides.summary,
    article_count: members.length,
    source_count: sourceIds.size,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    updated_at: now,
  }).where(eq(events.id, eventId));
  return {
    eventId,
    articleCount: members.length,
    sourceCount: sourceIds.size,
    firstSeenAt,
    lastSeenAt,
    primaryArticleId: primary.articleId,
  };
}
