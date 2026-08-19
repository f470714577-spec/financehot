import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const financialFilterSchema = z.object({
  isFinancial: z.boolean(),
  score: z.number().min(0).max(1),
  reason: boundedText(300),
}).strict();
export type FinancialFilterResult = z.infer<typeof financialFilterSchema>;

export const translateSchema = z.object({
  titleZh: boundedText(160),
}).strict();
export type TranslateResult = z.infer<typeof translateSchema>;

export const summarizeSchema = z.object({
  summaryZh: z.string().trim().refine((value) => {
    const length = Array.from(value).length;
    return length >= 80 && length <= 180;
  }, 'summaryZh 必须为 80–180 个字符'),
  reason: boundedText(300),
}).strict();
export type SummarizeResult = z.infer<typeof summarizeSchema>;

export const classifySchema = z.object({
  categories: z.array(z.object({ slug: boundedText(80), confidence: z.number().min(0).max(1) }).strict()).max(3),
}).strict();
export type ClassifyResult = z.infer<typeof classifySchema>;

const entityName = z.string().trim().min(1).max(120);
export const entityExtractionSchema = z.object({
  countries: z.array(z.object({ code: z.string().regex(/^[A-Z]{2}$/), role: z.enum(['mentioned', 'primary', 'impact']) }).strict()).max(10),
  markets: z.array(entityName).max(10),
  assets: z.array(entityName).max(10),
  companies: z.array(entityName).max(10),
  people: z.array(entityName).max(10),
  tickerCandidates: z.array(z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/)).max(10),
}).strict();
export type EntityExtractionResult = z.infer<typeof entityExtractionSchema>;

export const eventClusterSchema = z.object({
  decision: z.enum(['merge', 'separate']),
  confidence: z.number().min(0).max(1),
  reason: boundedText(300),
  title: boundedText(160),
  summary: boundedText(500),
}).strict();
export type EventClusterResult = z.infer<typeof eventClusterSchema>;

export const aiResultSchemas = {
  'financial-filter': financialFilterSchema,
  translate: translateSchema,
  summarize: summarizeSchema,
  classify: classifySchema,
  'entity-extraction': entityExtractionSchema,
  'event-cluster': eventClusterSchema,
} as const;
