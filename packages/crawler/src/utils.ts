import { createHash } from 'node:crypto';

import { CrawlerError } from './errors';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function boundedText(value: unknown, max = 20_000): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

export function readString(value: unknown): string | undefined {
  if (Array.isArray(value)) return readString(value[0]);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return readString(record['#text'] ?? record.text ?? record.value);
  }
  return boundedText(value, 200_000);
}

export function parseDate(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function detectLanguage(value: string | undefined, fallback?: string | null): string | undefined {
  if (fallback) return fallback;
  if (!value) return undefined;
  const chinese = (value.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  if (chinese > 0 && chinese >= latin / 4) return 'zh';
  if (latin > 0) return 'en';
  return undefined;
}

export function canonicalizeUrl(value: string, base?: string): string {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch (error) {
    throw new CrawlerError('文章 URL 无效', 'parse', false, undefined, value, error);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new CrawlerError('文章 URL 协议或凭据不安全', 'security', false, undefined, value);
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.*|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function pathValue(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, part) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    if (typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

export function toErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
