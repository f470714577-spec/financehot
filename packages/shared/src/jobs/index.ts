import { z } from 'zod';

export const JOB_CONTRACT_VERSION = 1 as const;

export const jobNameSchema = z.enum([
  'crawl',
  'normalize',
  'ai_process',
  'embedding',
  'cluster',
  'score',
  'daily_report',
]);
export type JobName = z.infer<typeof jobNameSchema>;

const idSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime({ offset: true });

const contractVersion = z.literal(JOB_CONTRACT_VERSION);

export const crawlJobPayloadSchema = z.object({
  version: contractVersion,
  sourceId: idSchema,
  crawlTaskId: idSchema,
  scheduledAt: dateTimeSchema,
});
export type CrawlJobPayload = z.infer<typeof crawlJobPayloadSchema>;

export const normalizeJobPayloadSchema = z.object({
  version: contractVersion,
  sourceId: idSchema,
  crawlTaskId: idSchema,
  crawlJobId: z.string().min(1).max(200),
  rawIds: z.array(idSchema).min(1).max(100),
  scheduledAt: dateTimeSchema,
});
export type NormalizeJobPayload = z.infer<typeof normalizeJobPayloadSchema>;

export const aiProcessJobPayloadSchema = z.object({
  version: contractVersion,
  articleId: idSchema,
  aiTaskId: idSchema,
});
export type AiProcessJobPayload = z.infer<typeof aiProcessJobPayloadSchema>;

export const embeddingJobPayloadSchema = z.object({
  version: contractVersion,
  articleId: idSchema,
  embeddingTaskId: idSchema,
});
export type EmbeddingJobPayload = z.infer<typeof embeddingJobPayloadSchema>;

export const clusterJobPayloadSchema = z.object({
  version: contractVersion,
  eventId: idSchema,
  clusterTaskId: idSchema,
});
export type ClusterJobPayload = z.infer<typeof clusterJobPayloadSchema>;

export const scoreJobPayloadSchema = z.object({
  version: contractVersion,
  articleId: idSchema.optional(),
  eventId: idSchema.optional(),
  scoreTaskId: idSchema,
}).refine((value) => value.articleId || value.eventId, 'score job 必须关联 articleId 或 eventId');
export type ScoreJobPayload = z.infer<typeof scoreJobPayloadSchema>;

export const dailyReportJobPayloadSchema = z.object({
  version: contractVersion,
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reportTaskId: idSchema,
});
export type DailyReportJobPayload = z.infer<typeof dailyReportJobPayloadSchema>;

export const jobPayloadSchemas = {
  crawl: crawlJobPayloadSchema,
  normalize: normalizeJobPayloadSchema,
  ai_process: aiProcessJobPayloadSchema,
  embedding: embeddingJobPayloadSchema,
  cluster: clusterJobPayloadSchema,
  score: scoreJobPayloadSchema,
  daily_report: dailyReportJobPayloadSchema,
} as const;

export type JobPayload =
  | CrawlJobPayload
  | NormalizeJobPayload
  | AiProcessJobPayload
  | EmbeddingJobPayload
  | ClusterJobPayload
  | ScoreJobPayload
  | DailyReportJobPayload;

export const IMPLEMENTED_JOB_NAMES = ['crawl', 'normalize', 'ai_process'] as const satisfies readonly JobName[];
export type ImplementedJobName = (typeof IMPLEMENTED_JOB_NAMES)[number];

export function parseJobPayload(name: JobName | string, payload: unknown): JobPayload {
  const schema = jobPayloadSchemas[name as JobName];
  if (!schema) throw new Error(`未定义的 job 名称: ${name}`);
  return schema.parse(payload) as JobPayload;
}

export function isImplementedJobName(name: JobName): name is ImplementedJobName {
  return (IMPLEMENTED_JOB_NAMES as readonly string[]).includes(name);
}
