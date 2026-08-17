export type CrawlErrorKind =
  | 'config'
  | 'security'
  | 'dns'
  | 'robots'
  | 'http'
  | 'content_type'
  | 'response_too_large'
  | 'timeout'
  | 'network'
  | 'parse';

export class CrawlerError extends Error {
  constructor(
    message: string,
    public readonly kind: CrawlErrorKind,
    public readonly retryable = false,
    public readonly status?: number,
    public readonly url?: string,
    public readonly cause?: unknown,
    public readonly retryAfter?: string,
  ) {
    super(message, { cause });
    this.name = 'CrawlerError';
  }
}

export function asCrawlerError(error: unknown, url?: string): CrawlerError {
  if (error instanceof CrawlerError) return error;
  return new CrawlerError(
    error instanceof Error ? error.message : String(error),
    'network',
    true,
    undefined,
    url,
    error,
  );
}
