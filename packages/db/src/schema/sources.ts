import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps, type SourceLevel, type SourceType, type TaskStatus } from './common';

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    type: text('type').notNull().$type<SourceType>(),
    country: text('country'),
    language: text('language'),
    homepage: text('homepage'),
    rss_url: text('rss_url').unique(),
    source_level: text('source_level').notNull().$type<SourceLevel>(),
    credibility_score: real('credibility_score'),
    enabled: boolean('enabled').notNull().default(true),
    crawl_interval: integer('crawl_interval'),
    last_crawled_at: timestamp('last_crawled_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('sources_enabled_idx').on(t.enabled),
    index('sources_source_level_idx').on(t.source_level),
  ],
);

export const crawl_tasks = pgTable(
  'crawl_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_id: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    status: text('status').notNull().$type<TaskStatus>().default('pending'),
    error: text('error'),
    retry_count: integer('retry_count').notNull().default(0),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    started_at: timestamp('started_at', { withTimezone: true }),
    finished_at: timestamp('finished_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('crawl_tasks_source_scheduled_unique').on(t.source_id, t.scheduled_at),
    index('crawl_tasks_status_idx').on(t.status),
    index('crawl_tasks_source_id_idx').on(t.source_id),
  ],
);
