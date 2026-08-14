import {
  foreignKey,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { articles } from './articles';
import { events } from './events';
import { timestamps, type ArticleCountryRole, type TagKind } from './common';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    parent_id: uuid('parent_id'),
    sort_order: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.parent_id], foreignColumns: [t.id] }),
  ],
);

export const article_categories = pgTable(
  'article_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    category_id: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    confidence: real('confidence'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('article_categories_unique').on(t.article_id, t.category_id)],
);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull(),
  kind: text('kind').notNull().$type<TagKind>(),
  ...timestamps(),
});

export const article_tags = pgTable(
  'article_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    tag_id: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('article_tags_unique').on(t.article_id, t.tag_id)],
);

export const countries = pgTable('countries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name_zh: text('name_zh').notNull(),
  name_en: text('name_en').notNull(),
  code: text('code').notNull().unique(),
  ...timestamps(),
});

export const article_countries = pgTable(
  'article_countries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    country_id: uuid('country_id')
      .notNull()
      .references(() => countries.id),
    role: text('role').$type<ArticleCountryRole>(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('article_countries_unique').on(t.article_id, t.country_id)],
);

export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  heat_score: real('heat_score'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const topic_articles = pgTable(
  'topic_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic_id: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('topic_articles_unique').on(t.topic_id, t.article_id)],
);

export const event_topics = pgTable(
  'event_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic_id: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    event_id: uuid('event_id')
      .notNull()
      .references(() => events.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('event_topics_unique').on(t.topic_id, t.event_id)],
);
