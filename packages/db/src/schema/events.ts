import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { articles } from './articles';
import {
  timestamps,
  type ClusterMethod,
  type EventStatus,
  type EventTimelineType,
} from './common';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug'),
    title: text('title').notNull(),
    summary: text('summary'),
    finance_score: real('finance_score'),
    heat_score: real('heat_score'),
    first_seen_at: timestamp('first_seen_at', { withTimezone: true }),
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
    article_count: integer('article_count').notNull().default(0),
    source_count: integer('source_count').notNull().default(0),
    status: text('status').notNull().$type<EventStatus>().default('developing'),
    ...timestamps(),
  },
  (t) => [
    index('events_heat_score_idx').on(t.heat_score),
    index('events_finance_score_idx').on(t.finance_score),
    index('events_first_seen_at_idx').on(t.first_seen_at),
  ],
);

export const event_articles = pgTable(
  'event_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event_id: uuid('event_id')
      .notNull()
      .references(() => events.id),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    is_primary: boolean('is_primary').notNull().default(false),
    similarity_score: real('similarity_score'),
    confidence: real('confidence'),
    cluster_method: text('cluster_method').$type<ClusterMethod>(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('event_articles_event_article_unique').on(t.event_id, t.article_id),
    // 同一 event 最多一条主报道（is_primary = true）
    uniqueIndex('event_articles_primary_unique')
      .on(t.event_id)
      .where(sql`${t.is_primary} = true`),
    index('event_articles_event_id_idx').on(t.event_id),
    index('event_articles_article_id_idx').on(t.article_id),
  ],
);

export const event_timeline = pgTable(
  'event_timeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event_id: uuid('event_id')
      .notNull()
      .references(() => events.id),
    occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull(),
    type: text('type').notNull().$type<EventTimelineType>(),
    description: text('description'),
    source_article_id: uuid('source_article_id').references(() => articles.id),
    ...timestamps(),
  },
  (t) => [
    index('event_timeline_event_id_idx').on(t.event_id),
    index('event_timeline_occurred_at_idx').on(t.occurred_at),
  ],
);
