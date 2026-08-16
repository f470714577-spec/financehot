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
