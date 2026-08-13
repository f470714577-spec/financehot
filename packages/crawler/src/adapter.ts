// 新闻采集 SourceAdapter 接口骨架。
// 阶段 01 仅定义接口，不抓取任何真实网站；阶段 06 实现 RSS/API/Web Adapter。

export type SourceType = 'rss' | 'api' | 'web';

export interface SourceLike {
  id: string;
  type: SourceType;
  rssUrl?: string | null;
  homepage?: string | null;
}

export interface RawItem {
  url: string;
  title?: string;
  rawContent?: string;
  fetchedAt: string;
}

export interface ParsedItem {
  originalUrl: string;
  canonicalUrl?: string;
  title?: string;
  content?: string;
  publishedAt?: string;
  language?: string;
}

export interface NormalizedArticleDTO {
  originalUrl: string;
  canonicalUrl?: string;
  originalTitle?: string;
  originalSummary?: string;
  originalLanguage?: string;
  publishedAt?: string;
  contentHash?: string;
  titleHash?: string;
}

export interface SourceAdapter {
  readonly type: SourceType;
  fetch(source: SourceLike): Promise<RawItem[]>;
  parse(raw: RawItem[]): Promise<ParsedItem[]>;
  normalize(parsed: ParsedItem[], source: SourceLike): Promise<NormalizedArticleDTO[]>;
}
