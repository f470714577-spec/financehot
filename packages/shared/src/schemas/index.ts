import { z } from 'zod';

const uuid = z.string().uuid();

const dateValue = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), '必须是有效日期或时间');

const dateOnlyValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '必须是 YYYY-MM-DD');

const booleanQuery = z.preprocess((value) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean());

export const marketSchema = z.enum(['china', 'us', 'europe', 'japan', 'global']);
export type Market = z.infer<typeof marketSchema>;

export const pageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const filterQueryFields = {
  from: dateValue.optional(),
  to: dateValue.optional(),
  market: marketSchema.optional(),
  category: z.string().min(1).max(80).optional(),
  country: z.string().regex(/^[A-Z]{2}$/, '国家必须是 ISO 两位代码').optional(),
  source: z.string().min(1).max(200).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  featured: booleanQuery.optional(),
  event: z.union([z.literal('linked'), z.literal('standalone'), uuid]).optional(),
};

export const newsQuerySchema = pageQuerySchema
  .extend(filterQueryFields)
  .superRefine((value, context) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to 不能早于 from' });
    }
  });
export type NewsQuery = z.infer<typeof newsQuerySchema>;

export const searchQuerySchema = pageQuerySchema
  .extend({
    q: z.string().trim().min(1).max(200),
    ...filterQueryFields,
  })
  .superRefine((value, context) => {
    if (value.from && value.to && Date.parse(value.from) > Date.parse(value.to)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to 不能早于 from' });
    }
  });
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const eventQuerySchema = pageQuerySchema.extend({
  minScore: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(['confirmed', 'developing', 'rumor', 'disputed', 'retracted']).optional(),
});
export type EventQuery = z.infer<typeof eventQuerySchema>;

export const hotQuerySchema = pageQuerySchema.extend({
  window: z.enum(['1h', '3h', '6h', '12h', '24h', '7d']).default('24h'),
});
export type HotQuery = z.infer<typeof hotQuerySchema>;

export const dailyQuerySchema = z.object({ date: dateOnlyValue.optional() });
export type DailyQuery = z.infer<typeof dailyQuerySchema>;

export const topicQuerySchema = pageQuerySchema;
export type TopicQuery = z.infer<typeof topicQuerySchema>;

export const topicIdSchema = z.union([uuid, z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)]);

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof errorSchema>;

export const sourceSchema = z.object({
  id: uuid,
  name: z.string(),
  country: z.string().nullable(),
  sourceLevel: z.enum(['A', 'B', 'C', 'D', 'E']),
  credibilityScore: z.number().nullable(),
});

export const categorySchema = z.object({
  slug: z.string(),
  name: z.string(),
});

export const countrySchema = z.object({
  code: z.string(),
  name: z.string(),
});

const eventStatusSchema = z.enum(['confirmed', 'developing', 'rumor', 'disputed', 'retracted']);

export const eventReferenceSchema = z.object({
  id: uuid,
  title: z.string(),
  summary: z.string().nullable(),
  financeScore: z.number().nullable(),
  heatScore: z.number().nullable(),
  status: eventStatusSchema,
  articleCount: z.number(),
  sourceCount: z.number(),
});
export type EventReference = z.infer<typeof eventReferenceSchema>;

export const newsItemSchema = z.object({
  id: uuid,
  title: z.string(),
  summary: z.string(),
  publishedAt: z.string().nullable(),
  source: sourceSchema,
  score: z.number(),
  financeScore: z.number().nullable(),
  marketImpactScore: z.number().nullable(),
  featured: z.boolean(),
  market: marketSchema,
  countries: z.array(countrySchema),
  category: categorySchema.nullable(),
  tags: z.array(z.string()),
  event: eventReferenceSchema.nullable(),
  relatedSources: z.number(),
  reason: z.string().nullable(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const listDataSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const eventSummarySchema = z.object({
  id: uuid,
  title: z.string(),
  summary: z.string().nullable(),
  financeScore: z.number().nullable(),
  heatScore: z.number().nullable(),
  status: eventStatusSchema,
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  articleCount: z.number(),
  sourceCount: z.number(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const timelineItemSchema = z.object({
  id: uuid,
  occurredAt: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  sourceArticleId: uuid.nullable(),
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;

export const eventDetailSchema = eventSummarySchema.extend({
  articles: z.array(newsItemSchema),
  timeline: z.array(timelineItemSchema),
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

export const topicSummarySchema = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  heatScore: z.number().nullable(),
  eventCount: z.number(),
  newsCount24h: z.number(),
  markets: z.array(z.string()),
  categories: z.array(z.string()),
});
export type TopicSummary = z.infer<typeof topicSummarySchema>;

export const topicDetailSchema = topicSummarySchema.extend({
  events: z.array(eventSummarySchema),
  articles: z.array(newsItemSchema),
});
export type TopicDetail = z.infer<typeof topicDetailSchema>;

export const dailyReportSchema = z.object({
  id: uuid,
  date: dateOnlyValue,
  timezone: z.string(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  summary: z.string(),
  topItems: z.array(z.object({ title: z.string(), score: z.number() })),
  sections: z.array(z.object({ name: z.string(), items: z.array(z.string()) })),
  relatedEvents: z.array(eventSummarySchema),
});
export type DailyReport = z.infer<typeof dailyReportSchema>;

export const homeDataSchema = z.object({
  stats: z.object({
    collected: z.number(),
    events: z.number(),
    featured: z.number(),
    majorEvents: z.number(),
  }),
  hot: listDataSchema(eventSummarySchema),
  news: listDataSchema(newsItemSchema),
});
export type HomeData = z.infer<typeof homeDataSchema>;

export type ApiSuccess<T> = { success: true; data: T; error: null };
export type ApiFailure = { success: false; data: null; error: ApiError };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// 阶段 06 Crawler DTO 与表驱动 Adapter 配置。配置只保存字段映射和环境变量名，绝不保存密钥值。
export const crawlerSourceTypeSchema = z.enum(['rss', 'api', 'web']);
export type CrawlerSourceType = z.infer<typeof crawlerSourceTypeSchema>;

export const crawlerSourceLevelSchema = z.enum(['A', 'B', 'C', 'D', 'E']);
export type CrawlerSourceLevel = z.infer<typeof crawlerSourceLevelSchema>;

const crawlerUrlSchema = z.string().url().refine((value) => {
  return /^(https?):\/\/[^/@\s]+(?:\/[^\s]*)?$/i.test(value);
}, '只允许无凭据的 http/https URL');

const envVarNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/, '必须是环境变量名');

export const sourceComplianceSchema = z.object({
  robotsUrl: crawlerUrlSchema.optional(),
  termsUrl: crawlerUrlSchema.optional(),
  checkedAt: dateValue,
  frequency: z.string().min(1).max(120),
  storeExcerptOnly: z.literal(true).default(true),
});
export type SourceCompliance = z.infer<typeof sourceComplianceSchema>;

const adapterCommonSchema = z.object({
  maxItems: z.number().int().min(1).max(100).default(20),
  maxBytes: z.number().int().min(1024).max(10_000_000).default(1_000_000),
  userAgent: z.string().min(8).max(200).default('FinanceHotCrawler/0.1 (+https://github.com/f470714577-spec/financehot)'),
  compliance: sourceComplianceSchema.optional(),
});

export const rssAdapterConfigSchema = adapterCommonSchema.extend({
  kind: z.literal('rss'),
  feedUrl: crawlerUrlSchema.optional(),
});

export const apiFieldMapSchema = z.object({
  url: z.string().min(1).max(160),
  canonicalUrl: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(160).optional(),
  content: z.string().min(1).max(160).optional(),
  publishedAt: z.string().min(1).max(160).optional(),
  language: z.string().min(1).max(160).optional(),
});
export type ApiFieldMap = z.infer<typeof apiFieldMapSchema>;

export const apiAdapterConfigSchema = adapterCommonSchema.extend({
  kind: z.literal('api'),
  endpoint: crawlerUrlSchema,
  itemsPath: z.string().max(160).default(''),
  fields: apiFieldMapSchema,
  headers: z.record(z.string().max(200)).optional(),
  authEnvVar: envVarNameSchema.optional(),
  authHeader: z.string().regex(/^[A-Za-z0-9-]{1,80}$/).default('Authorization'),
  authScheme: z.enum(['Bearer', 'ApiKey', 'Raw']).default('Bearer'),
});

export const webFieldMapSchema = z.object({
  url: z.string().min(1).max(200),
  canonicalUrl: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(200).optional(),
  publishedAt: z.string().min(1).max(200).optional(),
  language: z.string().min(1).max(200).optional(),
});
export type WebFieldMap = z.infer<typeof webFieldMapSchema>;

export const webAdapterConfigSchema = adapterCommonSchema.extend({
  kind: z.literal('web'),
  listingUrl: crawlerUrlSchema,
  itemSelector: z.string().min(1).max(200),
  fields: webFieldMapSchema,
});

export const sourceAdapterConfigSchema = z.discriminatedUnion('kind', [
  rssAdapterConfigSchema,
  apiAdapterConfigSchema,
  webAdapterConfigSchema,
]);
export type SourceAdapterConfig = z.infer<typeof sourceAdapterConfigSchema>;
export type SourceAdapterConfigInput = z.input<typeof sourceAdapterConfigSchema>;

export const crawlerSourceSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  type: crawlerSourceTypeSchema,
  country: z.string().max(8).nullable().optional(),
  language: z.string().max(32).nullable().optional(),
  homepage: crawlerUrlSchema.nullable().optional(),
  rssUrl: crawlerUrlSchema.nullable().optional(),
  sourceLevel: crawlerSourceLevelSchema,
  enabled: z.boolean().default(true),
  crawlInterval: z.number().int().min(1).max(86_400).default(3_600),
  adapterConfig: sourceAdapterConfigSchema.nullable().optional(),
});
export type SourceDTO = z.infer<typeof crawlerSourceSchema>;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i, '必须是 SHA-256 十六进制哈希');

export const rawArticleSchema = z.object({
  sourceId: z.string().min(1).max(120),
  originalUrl: crawlerUrlSchema,
  canonicalUrl: crawlerUrlSchema.optional(),
  rawTitle: z.string().max(500).optional(),
  rawContent: z.string().max(200_000).optional(),
  fetchedAt: dateValue,
  contentType: z.string().min(1).max(160),
  contentHash: hashSchema,
  titleHash: hashSchema.optional(),
});
export type RawArticleDTO = z.infer<typeof rawArticleSchema>;

export const parsedArticleSchema = z.object({
  sourceId: z.string().min(1).max(120),
  originalUrl: crawlerUrlSchema,
  canonicalUrl: crawlerUrlSchema.optional(),
  title: z.string().min(1).max(500),
  summary: z.string().max(20_000).optional(),
  content: z.string().max(200_000).optional(),
  publishedAt: dateValue.optional(),
  language: z.string().max(32).optional(),
  fetchedAt: dateValue,
});
export type ParsedArticleDTO = z.infer<typeof parsedArticleSchema>;

export const normalizedArticleSchema = z.object({
  sourceId: z.string().min(1).max(120),
  originalUrl: crawlerUrlSchema,
  canonicalUrl: crawlerUrlSchema,
  originalTitle: z.string().min(1).max(500),
  originalSummary: z.string().max(20_000).optional(),
  originalLanguage: z.string().max(32).optional(),
  publishedAt: dateValue.optional(),
  fetchedAt: dateValue,
  contentHash: hashSchema,
  titleHash: hashSchema,
});
export type NormalizedArticleDTO = z.infer<typeof normalizedArticleSchema>;
