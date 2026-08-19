import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';
import { articles } from './articles';
import { events } from './events';
import { timestamps, type AiTaskType, type TaskStatus } from './common';

export const ai_tasks = pgTable(
  'ai_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_type: text('task_type').notNull().$type<AiTaskType>(),
    article_id: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    event_id: uuid('event_id').references(() => events.id),
    status: text('status').notNull().$type<TaskStatus>().default('pending'),
    prompt_version: text('prompt_version'),
    model: text('model'),
    provider: text('provider'),
    input_hash: text('input_hash'),
    cache_key: text('cache_key'),
    result_json: jsonb('result_json').$type<Record<string, unknown> | null>(),
    error: text('error'),
    retry_count: integer('retry_count').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index('ai_tasks_status_idx').on(t.status),
    index('ai_tasks_article_id_idx').on(t.article_id),
    index('ai_tasks_task_type_idx').on(t.task_type),
    unique('ai_tasks_cache_key_unique').on(t.cache_key),
  ],
);

export const ai_usage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ai_task_id: uuid('ai_task_id')
      .notNull()
      .references(() => ai_tasks.id),
    provider: text('provider'),
    model: text('model'),
    task_type: text('task_type'),
    article_id: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull().default(1),
    provider_attempt: integer('provider_attempt').notNull().default(1),
    outcome: text('outcome').notNull(),
    http_status: integer('http_status'),
    usage_reported: boolean('usage_reported').notNull().default(false),
    prompt_tokens: integer('prompt_tokens').notNull().default(0),
    completion_tokens: integer('completion_tokens').notNull().default(0),
    estimated_cost: real('estimated_cost'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ai_usage_ai_task_id_idx').on(t.ai_task_id),
    index('ai_usage_article_id_idx').on(t.article_id),
    index('ai_usage_task_type_idx').on(t.task_type),
    index('ai_usage_created_at_idx').on(t.created_at),
    unique('ai_usage_task_attempt_provider_attempt_unique').on(t.ai_task_id, t.attempt, t.provider_attempt),
  ],
);
