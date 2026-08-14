import { date, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const daily_reports = pgTable(
  'daily_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(),
    timezone: text('timezone').notNull(),
    model: text('model'),
    prompt_version: text('prompt_version'),
    content_json: jsonb('content_json'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('daily_reports_unique').on(t.date, t.timezone)],
);
