import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

import { CrawlerError, asCrawlerError } from './errors';

export interface DnsAddress {
  address: string;
  family: 4 | 6;
}

export interface RawHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
}

export interface RequestOptions {
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  address: DnsAddress;
}

export type RequestImplementation = (url: URL, options: RequestOptions) => Promise<RawHttpResponse>;
export type ResolveImplementation = (hostname: string) => Promise<DnsAddress[]>;
export type SleepImplementation = (ms: number) => Promise<void>;

export interface SafeFetchOptions {
  sourceId?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  maxRetryDelayMs?: number;
  allowedContentTypes?: RegExp;
  allowedStatuses?: Set<number>;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
  finalUrl: string;
  contentType: string;
}

export interface SafeFetcherOptions {
  resolve?: ResolveImplementation;
  request?: RequestImplementation;
  sleep?: SleepImplementation;
  now?: () => number;
  defaultTimeoutMs?: number;
  defaultMaxBytes?: number;
  defaultMaxRedirects?: number;
  defaultMaxAttempts?: number;
  userAgent?: string;
  minIntervalMs?: number;
}

const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

function ipv4Parts(address: string): number[] | undefined {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return undefined;
  const numbers = parts.map(Number);
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : undefined;
}

function ipv6Parts(address: string): number[] | undefined {
  const normalized = address.toLowerCase().split('%')[0];
  const [left, right] = normalized.split('::');
  if (normalized.split('::').length > 2) return undefined;
  const expand = (part: string): number[] => {
    if (!part) return [];
    const values = part.split(':');
    const result: number[] = [];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (value.includes('.')) {
        const v4 = ipv4Parts(value);
        if (!v4 || index !== values.length - 1) return [];
        result.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(value)) {
        result.push(Number.parseInt(value, 16));
      } else {
        return [];
      }
    }
    return result;
  };
  const leftParts = expand(left ?? '');
  const rightParts = expand(right ?? '');
  if (leftParts.length + rightParts.length > 8) return undefined;
  const missing = 8 - leftParts.length - rightParts.length;
  if (!normalized.includes('::') && missing !== 0) return undefined;
  return [...leftParts, ...Array.from({ length: missing }, () => 0), ...rightParts];
}

function isIpv4InRange(parts: number[], start: number[], maskBits: number): boolean {
  const value = parts.reduce((acc, part) => acc * 256 + part, 0);
  const startValue = start.reduce((acc, part) => acc * 256 + part, 0);
  const mask = maskBits === 0 ? 0 : (2 ** 32 - 2 ** (32 - maskBits)) >>> 0;
  return (value >>> 0 & mask) === (startValue >>> 0 & mask);
}

export function isForbiddenAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = ipv4Parts(address);
    if (!parts) return true;
    return (
      isIpv4InRange(parts, [0, 0, 0, 0], 8) ||
      isIpv4InRange(parts, [10, 0, 0, 0], 8) ||
      isIpv4InRange(parts, [100, 64, 0, 0], 10) ||
      isIpv4InRange(parts, [127, 0, 0, 0], 8) ||
      isIpv4InRange(parts, [169, 254, 0, 0], 16) ||
      isIpv4InRange(parts, [172, 16, 0, 0], 12) ||
      isIpv4InRange(parts, [192, 0, 0, 0], 24) ||
      isIpv4InRange(parts, [192, 0, 2, 0], 24) ||
      isIpv4InRange(parts, [192, 168, 0, 0], 16) ||
      isIpv4InRange(parts, [198, 18, 0, 0], 15) ||
      isIpv4InRange(parts, [198, 51, 100, 0], 24) ||
      isIpv4InRange(parts, [203, 0, 113, 0], 24) ||
      isIpv4InRange(parts, [224, 0, 0, 0], 4) ||
      isIpv4InRange(parts, [240, 0, 0, 0], 4)
    );
  }
  if (family !== 6) return true;
  const parts = ipv6Parts(address);
  if (!parts) return true;
  const isZero = parts.every((part) => part === 0);
  const isLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
  const isMapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  const isUniqueLocal = (parts[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (parts[0] & 0xffc0) === 0xfe80;
  const isMulticast = (parts[0] & 0xff00) === 0xff00;
  if (isMapped) {
    const mapped = [(parts[6] >> 8) & 255, parts[6] & 255, (parts[7] >> 8) & 255, parts[7] & 255];
    return isForbiddenAddress(mapped.join('.'));
  }
  return isZero || isLoopback || isUniqueLocal || isLinkLocal || isMulticast;
}

async function defaultResolve(hostname: string): Promise<DnsAddress[]> {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersToRecord(headers: http.IncomingHttpHeaders): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

const nodeRequest: RequestImplementation = (url, options) =>
  new Promise((resolve, reject) => {
    const requestModule = url.protocol === 'https:' ? https : http;
    const host = url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname;
    const defaultPort = url.protocol === 'https:' ? '443' : '80';
    const hostHeader = `${host}${url.port && url.port !== defaultPort ? `:${url.port}` : ''}`;
    const requestOptions = {
      protocol: url.protocol,
      hostname: options.address.address,
      port: url.port || defaultPort,
      path: `${url.pathname || '/'}${url.search}`,
      method: 'GET',
      headers: { ...options.headers, host: hostHeader },
      lookup: (_hostname: string, _options: object, callback: (error: Error | null, address: string, family: number) => void) =>
        callback(null, options.address.address, options.address.family),
      servername: url.hostname,
    } as http.RequestOptions;
    const request = requestModule.request(requestOptions, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > options.maxBytes) {
          request.destroy(new CrawlerError('响应超过字节上限', 'response_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearRequestTimer();
        resolve({ status: response.statusCode ?? 0, headers: headersToRecord(response.headers), body: Buffer.concat(chunks) });
      });
      response.on('error', (error) => {
        clearRequestTimer();
        reject(error);
      });
    });
    const timer = setTimeout(() => request.destroy(new CrawlerError('请求超时', 'timeout')), options.timeoutMs);
    const clearRequestTimer = () => clearTimeout(timer);
    request.on('error', (error) => {
      clearRequestTimer();
      reject(error);
    });
    request.end();
  });

function retryAfterMs(value: string | undefined, now: number, maxDelay: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(maxDelay, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.min(maxDelay, Math.max(0, date - now));
}

function isRetryableError(error: CrawlerError): boolean {
  return error.retryable || error.kind === 'timeout' || error.kind === 'network';
}

export class SourceRateLimiter {
  private readonly nextAllowed = new Map<string, number>();

  constructor(private readonly minIntervalMs = 0, private readonly now = () => Date.now(), private readonly sleep = defaultSleep) {}

  async wait(sourceId?: string): Promise<void> {
    if (!sourceId || this.minIntervalMs <= 0) return;
    const current = this.now();
    const next = this.nextAllowed.get(sourceId) ?? current;
    const delay = Math.max(0, next - current);
    if (delay > 0) await this.sleep(delay);
    this.nextAllowed.set(sourceId, Math.max(this.now(), next) + this.minIntervalMs);
  }
}

export class SafeFetcher {
  private readonly resolve: ResolveImplementation;
  private readonly request: RequestImplementation;
  private readonly sleep: SleepImplementation;
  private readonly now: () => number;
  private readonly limiter: SourceRateLimiter;
  private readonly defaults: Required<Pick<SafeFetcherOptions, 'defaultTimeoutMs' | 'defaultMaxBytes' | 'defaultMaxRedirects' | 'defaultMaxAttempts'>>;
  private readonly userAgent: string;

  constructor(options: SafeFetcherOptions = {}) {
    this.resolve = options.resolve ?? defaultResolve;
    this.request = options.request ?? nodeRequest;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
    this.limiter = new SourceRateLimiter(options.minIntervalMs ?? 0, this.now, this.sleep);
    this.defaults = {
      defaultTimeoutMs: options.defaultTimeoutMs ?? 10_000,
      defaultMaxBytes: options.defaultMaxBytes ?? 1_000_000,
      defaultMaxRedirects: options.defaultMaxRedirects ?? 5,
      defaultMaxAttempts: options.defaultMaxAttempts ?? 3,
    };
    this.userAgent = options.userAgent ?? 'FinanceHotCrawler/0.1 (+https://github.com/f470714577-spec/financehot)';
  }

  async fetch(urlValue: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
    const maxAttempts = options.maxAttempts ?? this.defaults.defaultMaxAttempts;
    let lastError: CrawlerError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchAttempt(urlValue, options);
        if (response.status >= 400 && !(options.allowedStatuses?.has(response.status) ?? false)) {
          const retryable = transientStatuses.has(response.status);
          throw new CrawlerError(`HTTP ${response.status}`, 'http', retryable, response.status, response.finalUrl, undefined, response.headers['retry-after']);
        }
        return response;
      } catch (error) {
        const crawlerError = asCrawlerError(error, urlValue);
        lastError = crawlerError;
        if (!isRetryableError(crawlerError) || attempt >= maxAttempts) throw crawlerError;
        const retryAfter = retryAfterMs(crawlerError.retryAfter, this.now(), options.maxRetryDelayMs ?? 30_000);
        const delay = retryAfter ?? Math.min(options.maxRetryDelayMs ?? 30_000, (options.retryBaseMs ?? 250) * 2 ** (attempt - 1));
        await this.sleep(delay);
      }
    }
    throw lastError ?? new CrawlerError('抓取失败', 'network', true, undefined, urlValue);
  }

  async fetchText(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
    return this.fetch(url, options);
  }

  private async fetchAttempt(urlValue: string, options: SafeFetchOptions): Promise<SafeFetchResponse> {
    let current: URL;
    try {
      current = new URL(urlValue);
    } catch (error) {
      throw new CrawlerError('URL 无效', 'security', false, undefined, urlValue, error);
    }
    let redirects = 0;
    const maxRedirects = options.maxRedirects ?? this.defaults.defaultMaxRedirects;
    while (redirects <= maxRedirects) {
      await this.limiter.wait(options.sourceId);
      const address = await this.safeAddress(current);
      const response = await this.request(current, {
        headers: { accept: '*/*', 'accept-encoding': 'identity', 'user-agent': this.userAgent, ...(options.headers ?? {}) },
        timeoutMs: options.timeoutMs ?? this.defaults.defaultTimeoutMs,
        maxBytes: options.maxBytes ?? this.defaults.defaultMaxBytes,
        address,
      });
      if (response.body.byteLength > (options.maxBytes ?? this.defaults.defaultMaxBytes)) {
        throw new CrawlerError('响应超过字节上限', 'response_too_large', false, response.status, current.toString());
      }
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
      const location = headers.location;
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        if (redirects >= maxRedirects) {
          throw new CrawlerError('超过重定向跳数上限', 'security', false, response.status, current.toString());
        }
        try {
          current = new URL(location, current);
        } catch (error) {
          throw new CrawlerError('重定向 Location 无效', 'security', false, response.status, current.toString(), error);
        }
        redirects += 1;
        continue;
      }
      if (response.status >= 300 && response.status < 400) {
        throw new CrawlerError('重定向缺少 Location', 'http', false, response.status, current.toString());
      }
      const contentType = headers['content-type']?.split(';', 1)[0].trim().toLowerCase() ?? '';
      const safeResponse = { status: response.status, headers, body: Buffer.from(response.body).toString('utf8'), finalUrl: current.toString(), contentType };
      if (response.status >= 400) return safeResponse;
      if (options.allowedContentTypes && !options.allowedContentTypes.test(contentType)) {
        throw new CrawlerError(`Content-Type 不允许: ${contentType || 'missing'}`, 'content_type', false, response.status, current.toString());
      }
      return safeResponse;
    }
    throw new CrawlerError('超过重定向跳数上限', 'security', false, undefined, current.toString());
  }

  private async safeAddress(url: URL): Promise<DnsAddress> {
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !url.hostname) {
      throw new CrawlerError('仅允许无凭据的 http/https URL', 'security', false, undefined, url.toString());
    }
    const literalFamily = net.isIP(url.hostname);
    const addresses = literalFamily
      ? [{ address: url.hostname, family: literalFamily as 4 | 6 }]
      : await this.resolve(url.hostname);
    if (!addresses.length || addresses.some((record) => isForbiddenAddress(record.address))) {
      throw new CrawlerError('DNS 解析包含禁止访问的地址', 'dns', false, undefined, url.toString());
    }
    return addresses[0];
  }
}
