import { customType, timestamp } from 'drizzle-orm/pg-core';

/**
 * 无维度 vector：实际维度由 article_embeddings.dimensions 字段记录，
 * 支持不同 provider/model 的不同维度（drizzle 内置 vector() 会生成固定 vector(N)）。
 */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector';
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: string) {
    return value.slice(1, -1).split(',').map((v) => Number.parseFloat(v));
  },
});

/** 通用审计时间戳列 factory（每表独立列对象，勿复用同一实例）。 */
export function timestamps() {
  return {
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  };
}

// 状态/类型常量：text 列 + TS union，避免 pgEnum 在状态机调整时反复改 migration。

export const RAW_PROCESSING_STATUS = [
  'pending',
  'normalized',
  'filtered_out',
  'duplicate',
  'failed',
] as const;
export type RawProcessingStatus = (typeof RAW_PROCESSING_STATUS)[number];

export const ARTICLE_PROCESSING_STATUS = [
  'raw',
  'normalized',
  'financial_filtered',
  'deduplicated',
  'translated',
  'summarized',
  'classified',
  'entity_extracted',
  'embedded',
  'clustered',
  'scored',
  'published',
  'filtered_out',
  'duplicate',
  'retry',
  'failed',
] as const;
export type ArticleProcessingStatus = (typeof ARTICLE_PROCESSING_STATUS)[number];

export const SOURCE_TYPE = ['rss', 'api', 'web'] as const;
export type SourceType = (typeof SOURCE_TYPE)[number];

export const SOURCE_LEVEL = ['A', 'B', 'C', 'D', 'E'] as const;
export type SourceLevel = (typeof SOURCE_LEVEL)[number];

export const EVENT_STATUS = [
  'confirmed',
  'developing',
  'rumor',
  'disputed',
  'retracted',
] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const CLUSTER_METHOD = ['manual', 'title', 'embedding', 'llm', 'hybrid'] as const;
export type ClusterMethod = (typeof CLUSTER_METHOD)[number];

export const AI_TASK_TYPE = [
  'financial-filter',
  'translate',
  'summarize',
  'classify',
  'entity-extraction',
  'finance-score',
  'market-impact',
  'event-cluster',
  'daily-report',
] as const;
export type AiTaskType = (typeof AI_TASK_TYPE)[number];

export const TASK_STATUS = ['pending', 'running', 'success', 'failed', 'retrying'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const ARTICLE_COUNTRY_ROLE = ['mentioned', 'primary', 'impact'] as const;
export type ArticleCountryRole = (typeof ARTICLE_COUNTRY_ROLE)[number];

export const TAG_KIND = ['分类标签', '事件标签'] as const;
export type TagKind = (typeof TAG_KIND)[number];

export const EVENT_TIMELINE_TYPE = [
  '首次报道',
  '媒体确认',
  '官方声明',
  '监管回应',
  '市场反应',
] as const;
export type EventTimelineType = (typeof EVENT_TIMELINE_TYPE)[number];
