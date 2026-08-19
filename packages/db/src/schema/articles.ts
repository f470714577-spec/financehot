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
import { desc, sql } from 'drizzle-orm';
import { sources } from './sources';
import {
  timestamps,
  vector,
  type ArticleProcessingStatus,
  type RawProcessingStatus,
} from './common';

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_id: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    original_url: text('original_url'),
    canonical_url: text('canonical_url').notNull().unique(),
    content_hash: text('content_hash'),
    title_hash: text('title_hash'),
    original_title: text('original_title'),
    title_zh: text('title_zh'),
    original_summary: text('original_summary'),
    summary_zh: text('summary_zh'),
    original_language: text('original_language'),
    published_at: timestamp('published_at', { withTimezone: true }),
    fetched_at: timestamp('fetched_at', { withTimezone: true }),
    finance_score: real('finance_score'),
    financial_relevance_score: real('financial_relevance_score'),
    importance_score: real('importance_score'),
    market_impact_score: real('market_impact_score'),
    source_quality_score: real('source_quality_score'),
    is_featured: boolean('is_featured').notNull().default(false),
    is_hidden: boolean('is_hidden').notNull().default(false),
    ai_reason: text('ai_reason'),
    processing_status: text('processing_status')
      .notNull()
      .$type<ArticleProcessingStatus>()
      .default('raw'),
    ...timestamps(),
  },
  (t) => [
    index('articles_published_at_idx').on(t.published_at),
    index('articles_fetched_at_idx').on(t.fetched_at),
    index('articles_finance_score_idx').on(t.finance_score),
    index('articles_financial_relevance_idx').on(t.financial_relevance_score),
    index('articles_processing_status_idx').on(t.processing_status),
    index('articles_content_hash_idx').on(t.content_hash),
    index('articles_title_hash_idx').on(t.title_hash),
    index('articles_visible_published_id_idx')
      .on(desc(t.published_at), desc(t.id))
      .where(sql`${t.is_hidden} = false`),
  ],
);

export const raw_articles = pgTable(
  'raw_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_id: uuid('source_id')
      .notNull()
      .references(() => sources.id),
    original_url: text('original_url'),
    canonical_url: text('canonical_url'),
    content_hash: text('content_hash').notNull(),
    raw_content: text('raw_content'),
    raw_title: text('raw_title'),
    fetched_at: timestamp('fetched_at', { withTimezone: true }).notNull(),
    language: text('language'),
    processing_status: text('processing_status')
      .notNull()
      .$type<RawProcessingStatus>()
      .default('pending'),
    article_id: uuid('article_id').references(() => articles.id),
    rejected_reason: text('rejected_reason'),
    duplicate_of_article_id: uuid('duplicate_of_article_id').references(() => articles.id),
    parser_version: text('parser_version'),
    ...timestamps(),
  },
  (t) => [
    unique('raw_articles_source_content_hash_unique').on(t.source_id, t.content_hash),
    index('raw_articles_processing_status_idx').on(t.processing_status),
    index('raw_articles_article_id_idx').on(t.article_id),
    index('raw_articles_canonical_url_idx').on(t.canonical_url),
  ],
);

export const article_embeddings = pgTable(
  'article_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    article_id: uuid('article_id')
      .notNull()
      .references(() => articles.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    embedding: vector('embedding').notNull(),
    input_hash: text('input_hash').notNull(),
    embedding_version: text('embedding_version').notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('article_embeddings_unique').on(
      t.article_id,
      t.provider,
      t.model,
      t.input_hash,
      t.embedding_version,
    ),
    index('article_embeddings_article_id_idx').on(t.article_id),
  ],
);
