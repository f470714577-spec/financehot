import { load, type CheerioAPI } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

import {
  apiAdapterConfigSchema,
  crawlerSourceSchema,
  normalizedArticleSchema,
  parsedArticleSchema,
  rssAdapterConfigSchema,
  sourceAdapterConfigSchema,
  type NormalizedArticleDTO,
  type ParsedArticleDTO,
  type SourceAdapterConfig,
  type SourceAdapterConfigInput,
  type SourceDTO,
  webAdapterConfigSchema,
} from '@financehot/shared';

import { CrawlerError } from './errors';
import { assertRobotsAllowed } from './robots';
import { SafeFetcher } from './safe-fetcher';
import { boundedText, canonicalizeUrl, detectLanguage, parseDate, pathValue, readString, sha256Hex } from './utils';

export type SourceType = 'rss' | 'api' | 'web';

/** 兼容阶段01的最小 Source 输入；阶段06的完整输入由 shared SourceDTO 校验。 */
export interface SourceLike {
  id: string;
  name?: string;
  type: SourceType;
  country?: string | null;
  language?: string | null;
  sourceLevel?: SourceDTO['sourceLevel'];
  enabled?: boolean;
  crawlInterval?: number;
  rssUrl?: string | null;
  homepage?: string | null;
  adapterConfig?: SourceAdapterConfig | SourceAdapterConfigInput | null;
}

/** RawItem 保留 url/title/rawContent 字段，同时携带 shared RawArticleDTO 的完整契约。 */
export interface RawItem {
  sourceId: string;
  originalUrl: string;
  canonicalUrl?: string;
  rawTitle?: string;
  rawContent?: string;
  fetchedAt: string;
  contentType: string;
  contentHash: string;
  titleHash?: string;
  url: string;
  title?: string;
}

export interface ParsedItem extends ParsedArticleDTO {
  originalUrl: string;
  canonicalUrl?: string;
  title: string;
  content?: string;
  publishedAt?: string;
  language?: string;
}

export type { NormalizedArticleDTO } from '@financehot/shared';

export interface SourceAdapter {
  readonly type: SourceType;
  fetch(source: SourceLike): Promise<RawItem[]>;
  parse(raw: RawItem[], source: SourceLike): Promise<ParsedItem[]>;
  normalize(parsed: ParsedItem[], source: SourceLike): Promise<NormalizedArticleDTO[]>;
  collect(source: SourceLike): Promise<{ raw: RawItem[]; parsed: ParsedItem[]; normalized: NormalizedArticleDTO[] }>;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function configFor(source: SourceLike, expected: SourceType): SourceAdapterConfig {
  const parsed = sourceAdapterConfigSchema.safeParse(source.adapterConfig);
  if (parsed.success && parsed.data.kind === expected) return parsed.data;
  if (expected === 'rss' && source.rssUrl) {
    return rssAdapterConfigSchema.parse({ kind: 'rss', feedUrl: source.rssUrl });
  }
  throw new CrawlerError(`Source ${source.id} 缺少 ${expected} adapter_config`, 'config');
}

function feedItemLink(item: Record<string, unknown>): string | undefined {
  const links = asArray(item.link);
  const preferred = links.find((link) => {
    if (!link || typeof link !== 'object') return false;
    return (link as Record<string, unknown>)['@_rel'] === 'alternate';
  });
  const candidate = preferred ?? links[0] ?? item.guid ?? item.id;
  if (candidate && typeof candidate === 'object') {
    const record = candidate as Record<string, unknown>;
    return readString(record['@_href'] ?? record['#text'] ?? record.href);
  }
  return readString(candidate);
}

function feedItemTitle(item: Record<string, unknown>): string | undefined {
  return boundedText(item.title, 500);
}

function rawFromItem(source: SourceLike, itemUrl: string, title: string | undefined, content: string, contentType: string): RawItem {
  const fetchedAt = new Date().toISOString();
  return {
    sourceId: source.id,
    originalUrl: itemUrl,
    rawTitle: title,
    rawContent: content,
    fetchedAt,
    contentType,
    contentHash: sha256Hex(content),
    titleHash: title ? sha256Hex(title) : undefined,
    url: itemUrl,
    title,
  };
}

function rawObject(raw: RawItem): Record<string, unknown> {
  if (!raw.rawContent) return {};
  try {
    const value = JSON.parse(raw.rawContent) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseRssObject(raw: RawItem): Record<string, unknown> {
  const wrapper = rawObject(raw);
  const item = wrapper.item;
  return item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
}

function toParsed(raw: RawItem, item: Record<string, unknown>, source: SourceLike): ParsedItem | undefined {
  const title = boundedText(item.title ?? raw.rawTitle, 500);
  const originalUrl = raw.originalUrl || raw.url;
  if (!title || !originalUrl) return undefined;
  const summary = boundedText(
    item.summary ?? item.description ?? item['content:encoded'] ?? item.content ?? item['dc:description'] ?? raw.rawContent,
    20_000,
  );
  const content = boundedText(item['content:encoded'] ?? item.content ?? summary, 200_000);
  const parsed = parsedArticleSchema.safeParse({
    sourceId: raw.sourceId,
    originalUrl,
    canonicalUrl: raw.canonicalUrl ?? originalUrl,
    title,
    summary,
    content,
    publishedAt: parseDate(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']),
    language: detectLanguage(`${title} ${summary ?? ''}`, source.language),
    fetchedAt: raw.fetchedAt,
  });
  return parsed.success ? (parsed.data as ParsedItem) : undefined;
}

function normalizeParsed(parsed: ParsedItem[], source: SourceLike): NormalizedArticleDTO[] {
  return parsed.flatMap((item) => {
    try {
      const content = boundedText(item.content ?? item.summary ?? item.title, 200_000) ?? item.title;
      const normalized = normalizedArticleSchema.parse({
        sourceId: item.sourceId || source.id,
        originalUrl: canonicalizeUrl(item.originalUrl),
        canonicalUrl: canonicalizeUrl(item.canonicalUrl ?? item.originalUrl),
        originalTitle: item.title,
        originalSummary: boundedText(item.summary ?? content, 20_000),
        originalLanguage: detectLanguage(`${item.title} ${content}`, item.language ?? source.language),
        publishedAt: item.publishedAt,
        fetchedAt: item.fetchedAt,
        contentHash: sha256Hex(content),
        titleHash: sha256Hex(item.title),
      });
      return [normalized];
    } catch {
      return [];
    }
  });
}

export class RssAdapter implements SourceAdapter {
  readonly type = 'rss' as const;

  constructor(private readonly fetcher = new SafeFetcher()) {}

  async fetch(source: SourceLike): Promise<RawItem[]> {
    const config = rssAdapterConfigSchema.parse(configFor(source, 'rss'));
    const feedUrl = config.feedUrl ?? source.rssUrl;
    if (!feedUrl) throw new CrawlerError(`Source ${source.id} 缺少 RSS URL`, 'config');
    const response = await this.fetcher.fetchText(feedUrl, {
      sourceId: source.id,
      maxBytes: config.maxBytes,
      allowedContentTypes: /^(application\/(rss\+xml|atom\+xml|xml)|text\/xml|application\/octet-stream)$/,
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    let document: Record<string, unknown>;
    try {
      document = xmlParser.parse(response.body) as Record<string, unknown>;
    } catch (error) {
      throw new CrawlerError('RSS/XML 解析失败', 'parse', false, undefined, response.finalUrl, error);
    }
    const rssChannel = (document.rss as Record<string, unknown> | undefined)?.channel;
    const rssValues = rssChannel && typeof rssChannel === 'object' ? asArray((rssChannel as Record<string, unknown>).item) : [];
    const atomValues = asArray((document.feed as Record<string, unknown> | undefined)?.entry);
    return [...rssValues, ...atomValues].flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const item = value as Record<string, unknown>;
      const itemUrl = feedItemLink(item);
      const title = feedItemTitle(item);
      if (!itemUrl || !title) return [];
      const absoluteUrl = canonicalizeUrl(itemUrl, response.finalUrl);
      const content = JSON.stringify({ item });
      return [rawFromItem(source, absoluteUrl, title, content, response.contentType || 'application/xml')];
    }).slice(0, config.maxItems);
  }

  async parse(raw: RawItem[], source: SourceLike): Promise<ParsedItem[]> {
    return raw.flatMap((item) => {
      const parsed = toParsed(item, parseRssObject(item), source);
      return parsed ? [parsed] : [];
    });
  }

  async normalize(parsed: ParsedItem[], source: SourceLike): Promise<NormalizedArticleDTO[]> {
    return normalizeParsed(parsed, source);
  }

  async collect(source: SourceLike) {
    const raw = await this.fetch(source);
    const parsed = await this.parse(raw, source);
    const normalized = await this.normalize(parsed, source);
    return { raw, parsed, normalized };
  }
}

function mappedValue(item: unknown, path: string | undefined): unknown {
  return path ? pathValue(item, path) : undefined;
}

function apiItemFromRaw(raw: RawItem): Record<string, unknown> {
  const wrapper = rawObject(raw);
  return wrapper.item && typeof wrapper.item === 'object' ? (wrapper.item as Record<string, unknown>) : {};
}

export class ApiAdapter implements SourceAdapter {
  readonly type = 'api' as const;

  constructor(private readonly fetcher = new SafeFetcher()) {}

  async fetch(source: SourceLike): Promise<RawItem[]> {
    const config = apiAdapterConfigSchema.parse(configFor(source, 'api'));
    const headers: Record<string, string> = { accept: 'application/json', ...(config.headers ?? {}) };
    if (config.authEnvVar) {
      const value = process.env[config.authEnvVar];
      if (!value) throw new CrawlerError(`环境变量 ${config.authEnvVar} 未配置`, 'config');
      headers[config.authHeader] = config.authScheme === 'Raw' ? value : `${config.authScheme} ${value}`;
    }
    const response = await this.fetcher.fetchText(config.endpoint, {
      sourceId: source.id,
      headers,
      maxBytes: config.maxBytes,
      allowedContentTypes: /^(application\/json|[\w.-]+\/[^;]+\+json)$/,
    });
    let document: unknown;
    try {
      document = JSON.parse(response.body) as unknown;
    } catch (error) {
      throw new CrawlerError('JSON API 解析失败', 'parse', false, undefined, response.finalUrl, error);
    }
    const items = pathValue(document, config.itemsPath);
    if (!Array.isArray(items)) throw new CrawlerError('JSON API itemsPath 不是数组', 'parse', false, undefined, response.finalUrl);
    return items.slice(0, config.maxItems).flatMap((item) => {
      const url = readString(mappedValue(item, config.fields.url));
      const title = boundedText(mappedValue(item, config.fields.title), 500);
      if (!url || !title) return [];
      const absoluteUrl = canonicalizeUrl(url, response.finalUrl);
      const content = JSON.stringify({ item });
      return [rawFromItem(source, absoluteUrl, title, content, response.contentType || 'application/json')];
    });
  }

  async parse(raw: RawItem[], source: SourceLike): Promise<ParsedItem[]> {
    const config = apiAdapterConfigSchema.parse(configFor(source, 'api'));
    return raw.flatMap((item) => {
      const value = apiItemFromRaw(item);
      const url = readString(mappedValue(value, config.fields.url));
      const title = boundedText(mappedValue(value, config.fields.title) ?? item.rawTitle, 500);
      if (!url || !title) return [];
      const summary = boundedText(mappedValue(value, config.fields.summary), 20_000);
      const content = boundedText(mappedValue(value, config.fields.content) ?? summary, 200_000);
      const parsed = parsedArticleSchema.safeParse({
        sourceId: item.sourceId,
        originalUrl: canonicalizeUrl(url, config.endpoint),
        canonicalUrl: config.fields.canonicalUrl ? canonicalizeUrl(readString(mappedValue(value, config.fields.canonicalUrl)) ?? url, config.endpoint) : canonicalizeUrl(url, config.endpoint),
        title,
        summary,
        content,
        publishedAt: config.fields.publishedAt ? parseDate(mappedValue(value, config.fields.publishedAt)) : undefined,
        language: config.fields.language ? readString(mappedValue(value, config.fields.language)) : detectLanguage(`${title} ${summary ?? ''}`, source.language),
        fetchedAt: item.fetchedAt,
      });
      return parsed.success ? [parsed.data as ParsedItem] : [];
    });
  }

  async normalize(parsed: ParsedItem[], source: SourceLike): Promise<NormalizedArticleDTO[]> {
    return normalizeParsed(parsed, source);
  }

  async collect(source: SourceLike) {
    const raw = await this.fetch(source);
    const parsed = await this.parse(raw, source);
    const normalized = await this.normalize(parsed, source);
    return { raw, parsed, normalized };
  }
}

function htmlValue($: CheerioAPI, item: unknown, selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  const separator = selector.lastIndexOf('@');
  const css = separator > 0 ? selector.slice(0, separator) : selector;
  const attribute = separator > 0 ? selector.slice(separator + 1) : undefined;
  let node = $(item as never).find(css).first();
  if (!node.length && $(item as never).is(css)) node = $(item as never);
  if (!node.length) return undefined;
  return boundedText(attribute ? node.attr(attribute) : node.text(), 200_000);
}

function cleanHtmlText($: CheerioAPI, item: unknown): string | undefined {
  const clone = $(item as never).clone();
  clone.find('script,style,noscript,template,svg').remove();
  return boundedText(clone.text(), 20_000);
}

export class WebAdapter implements SourceAdapter {
  readonly type = 'web' as const;

  constructor(private readonly fetcher = new SafeFetcher()) {}

  async fetch(source: SourceLike): Promise<RawItem[]> {
    const config = webAdapterConfigSchema.parse(configFor(source, 'web'));
    await assertRobotsAllowed(this.fetcher, config.listingUrl, config.userAgent, source.id);
    const response = await this.fetcher.fetchText(config.listingUrl, {
      sourceId: source.id,
      maxBytes: config.maxBytes,
      headers: { accept: 'text/html, application/xhtml+xml' },
      allowedContentTypes: /^(text\/html|application\/xhtml\+xml)$/,
    });
    const $ = load(response.body);
    return $(config.itemSelector).toArray().slice(0, config.maxItems).flatMap((item) => {
      const url = htmlValue($, item, config.fields.url);
      const title = boundedText(htmlValue($, item, config.fields.title) ?? cleanHtmlText($, item), 500);
      if (!url || !title) return [];
      const absoluteUrl = canonicalizeUrl(url, response.finalUrl);
      const summary = boundedText(htmlValue($, item, config.fields.summary), 20_000);
      const content = boundedText(htmlValue($, item, config.fields.content) ?? summary ?? cleanHtmlText($, item), 20_000);
      return [rawFromItem(source, absoluteUrl, title, JSON.stringify({
        url: absoluteUrl,
        title,
        summary,
        content,
        canonicalUrl: htmlValue($, item, config.fields.canonicalUrl),
        publishedAt: htmlValue($, item, config.fields.publishedAt),
        language: htmlValue($, item, config.fields.language),
      }), response.contentType || 'text/html')];
    });
  }

  async parse(raw: RawItem[], source: SourceLike): Promise<ParsedItem[]> {
    const config = webAdapterConfigSchema.parse(configFor(source, 'web'));
    return raw.flatMap((item) => {
      const value = rawObject(item);
      const url = readString(value.url ?? item.originalUrl);
      const title = boundedText(value.title ?? item.rawTitle, 500);
      if (!url || !title) return [];
      const parsed = parsedArticleSchema.safeParse({
        sourceId: item.sourceId,
        originalUrl: canonicalizeUrl(url, config.listingUrl),
        canonicalUrl: canonicalizeUrl(readString(value.canonicalUrl) ?? url, config.listingUrl),
        title,
        summary: boundedText(value.summary, 20_000),
        content: boundedText(value.content, 20_000),
        publishedAt: parseDate(value.publishedAt),
        language: detectLanguage(`${title} ${readString(value.summary) ?? ''}`, readString(value.language) ?? source.language),
        fetchedAt: item.fetchedAt,
      });
      return parsed.success ? [parsed.data as ParsedItem] : [];
    });
  }

  async normalize(parsed: ParsedItem[], source: SourceLike): Promise<NormalizedArticleDTO[]> {
    return normalizeParsed(parsed, source);
  }

  async collect(source: SourceLike) {
    const raw = await this.fetch(source);
    const parsed = await this.parse(raw, source);
    const normalized = await this.normalize(parsed, source);
    return { raw, parsed, normalized };
  }
}

export function createSourceAdapter(type: SourceType, fetcher = new SafeFetcher()): SourceAdapter {
  if (type === 'rss') return new RssAdapter(fetcher);
  if (type === 'api') return new ApiAdapter(fetcher);
  if (type === 'web') return new WebAdapter(fetcher);
  throw new CrawlerError(`不支持的 Source type: ${type}`, 'config');
}

export function validateSource(source: unknown): SourceDTO {
  return crawlerSourceSchema.parse(source);
}
