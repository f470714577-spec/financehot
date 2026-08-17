import { createHash } from 'node:crypto';

import type { JobName } from '@financehot/shared';

export function scheduledSlot(now: Date, crawlIntervalSeconds: number): Date {
  const intervalMs = Math.max(1, crawlIntervalSeconds) * 1_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
}

export function crawlJobId(sourceId: string, scheduledAt: Date): string {
  return `crawl-${sourceId}-${scheduledAt.getTime()}`;
}

export function normalizeJobId(crawlTaskId: string, rawIds: string[]): string {
  const digest = createHash('sha256').update([...rawIds].sort().join(',')).digest('hex').slice(0, 16);
  return `normalize-${crawlTaskId}-${digest}`;
}

export function unsupportedJobMessage(name: JobName | string): string {
  return `阶段07不消费 job: ${name}`;
}
