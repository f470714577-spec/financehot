import type { JobsOptions } from 'bullmq';

const positiveInt = (value: string | undefined, fallback: number, maximum = 100_000) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

export const QUEUE_NAMES = ['crawl', 'normalize', 'ai_process', 'embedding', 'cluster', 'score', 'daily_report'] as const;

export function getWorkerConfig() {
  return {
    queuePrefix: process.env.FINANCEHOT_QUEUE_PREFIX ?? 'financehot:stage07',
    concurrency: positiveInt(process.env.FINANCEHOT_WORKER_CONCURRENCY, 2, 32),
    attempts: positiveInt(process.env.FINANCEHOT_QUEUE_ATTEMPTS, 3, 10),
    backoff: {
      type: 'exponential' as const,
      delay: positiveInt(process.env.FINANCEHOT_QUEUE_BACKOFF_MS, 1_000, 300_000),
    },
    removeOnComplete: positiveInt(process.env.FINANCEHOT_KEEP_COMPLETED, 100, 100_000),
    removeOnFail: positiveInt(process.env.FINANCEHOT_KEEP_FAILED, 100, 100_000),
    schedulerIntervalMs: positiveInt(process.env.FINANCEHOT_SCHEDULER_INTERVAL_MS, 30_000, 3_600_000),
    lockTtlMs: positiveInt(process.env.FINANCEHOT_SOURCE_LOCK_TTL_MS, 900_000, 86_400_000),
    idlePollMs: 25,
    idleTimeoutMs: positiveInt(process.env.FINANCEHOT_DRAIN_TIMEOUT_MS, 120_000, 3_600_000),
  } as const;
}

export const WORKER_CONFIG = getWorkerConfig();

export type QueueName = (typeof QUEUE_NAMES)[number];

export function defaultJobOptions(config = getWorkerConfig()): JobsOptions {
  return {
    attempts: config.attempts,
    backoff: config.backoff,
    removeOnComplete: config.removeOnComplete,
    removeOnFail: config.removeOnFail,
  };
}
