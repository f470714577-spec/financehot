import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import {
  apiAdapterConfigSchema,
  sourceAdapterConfigSchema,
  sourceComplianceSchema,
} from '@financehot/shared';

import { ApiAdapter, RssAdapter, WebAdapter, type SourceLike } from './adapter';
import { CrawlerError } from './errors';
import { RobotsPolicy, assertRobotsAllowed } from './robots';
import {
  SafeFetcher,
  SourceRateLimiter,
  isForbiddenAddress,
  type RawHttpResponse,
} from './safe-fetcher';
import { canonicalizeUrl, detectLanguage, sha256Hex } from './utils';

const rssXml = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Fixture</title>
<item><title>Market rises</title><link>https://news.example/items/one?utm_source=test</link><description>Market summary</description><pubDate>Mon, 17 Aug 2026 01:02:03 GMT</pubDate></item>
<item><title>人民币市场</title><link>https://news.example/items/two</link><description>人民币与利率</description><dc:date xmlns:dc="http://purl.org/dc/elements/1.1/">2026-08-17T02:03:04Z</dc:date></item>
</channel></rss>`;

const atomXml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture Atom</title>
<entry><title>Atom release</title><link rel="alternate" href="https://news.example/atom/one"/><summary>Atom summary</summary><updated>2026-08-17T03:04:05Z</updated></entry>
</feed>`;

function response(status: number, body: string, contentType: string, headers: Record<string, string | undefined> = {}): RawHttpResponse {
  return { status, body: new TextEncoder().encode(body), headers: { 'content-type': contentType, ...headers } };
}

function fixtureFetcher(
  responses: Record<string, RawHttpResponse | (() => RawHttpResponse)>,
  calls: string[] = [],
  options: Partial<ConstructorParameters<typeof SafeFetcher>[0]> = {},
) {
  return new SafeFetcher({
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async (url, requestOptions) => {
      calls.push(url.toString());
      const item = responses[url.toString()];
      if (!item) throw new Error(`missing fixture: ${url}`);
      const result = typeof item === 'function' ? item() : item;
      assert.ok(result.body.byteLength <= requestOptions.maxBytes, 'fixture request respects maxBytes boundary');
      return result;
    },
    ...options,
  });
}

const rssSource: SourceLike = {
  id: 'source-rss',
  type: 'rss',
  language: 'en',
  adapterConfig: { kind: 'rss', feedUrl: 'https://news.example/feed.xml', maxItems: 10 },
};

describe('RSS Adapter', () => {
  test('解析 RSS 并完成 fetch→parse→normalize', async () => {
    const calls: string[] = [];
    const fetcher = fixtureFetcher({ 'https://news.example/feed.xml': response(200, rssXml, 'application/rss+xml') }, calls);
    const result = await new RssAdapter(fetcher).collect(rssSource);
    assert.equal(calls.length, 1);
    assert.equal(result.raw.length, 2);
    assert.equal(result.parsed.length, 2);
    assert.equal(result.normalized.length, 2);
    assert.equal(result.normalized[0].canonicalUrl, 'https://news.example/items/one');
  });

  test('解析 Atom alternate link、日期和摘要', async () => {
    const fetcher = fixtureFetcher({ 'https://news.example/feed.xml': response(200, atomXml, 'application/atom+xml') });
    const result = await new RssAdapter(fetcher).collect(rssSource);
    assert.equal(result.parsed[0].originalUrl, 'https://news.example/atom/one');
    assert.equal(result.parsed[0].publishedAt, '2026-08-17T03:04:05.000Z');
    assert.equal(result.normalized[0].originalSummary, 'Atom summary');
  });

  test('缺少 URL 或标题的 RSS item 被安全丢弃', async () => {
    const malformed = '<rss><channel><item><title>no url</title></item><item><link>https://news.example/ok</link></item></channel></rss>';
    const fetcher = fixtureFetcher({ 'https://news.example/feed.xml': response(200, malformed, 'application/rss+xml') });
    const result = await new RssAdapter(fetcher).collect(rssSource);
    assert.equal(result.raw.length, 0);
    assert.equal(result.normalized.length, 0);
  });

  test('中文语言检测优先使用 source 配置，否则按文本推断', async () => {
    assert.equal(detectLanguage('人民币 利率 市场', undefined), 'zh');
    const fetcher = fixtureFetcher({ 'https://news.example/feed.xml': response(200, rssXml, 'application/rss+xml') });
    const result = await new RssAdapter(fetcher).collect({ ...rssSource, language: null });
    assert.equal(result.normalized[1].originalLanguage, 'zh');
  });

  test('RSS 内容和标题产生稳定 SHA-256', async () => {
    const fetcher = fixtureFetcher({ 'https://news.example/feed.xml': response(200, rssXml, 'application/rss+xml') });
    const result = await new RssAdapter(fetcher).collect(rssSource);
    assert.match(result.raw[0].contentHash, /^[a-f0-9]{64}$/);
    assert.equal(result.normalized[0].titleHash, sha256Hex('Market rises'));
  });
});

describe('JSON API Adapter', () => {
  const apiSource: SourceLike = {
    id: 'source-api',
    type: 'api',
    language: 'en',
    adapterConfig: {
      kind: 'api',
      endpoint: 'https://api.example/news',
      itemsPath: 'data.items',
      fields: { url: 'url', title: 'headline', summary: 'summary', publishedAt: 'published_at', language: 'lang' },
    },
  };

  test('按 itemsPath 和字段映射解析 JSON', async () => {
    const body = JSON.stringify({ data: { items: [{ url: '/one', headline: 'API one', summary: 'Summary', published_at: '2026-08-17T00:00:00Z', lang: 'en' }] } });
    const fetcher = fixtureFetcher({ 'https://api.example/news': response(200, body, 'application/json') });
    const result = await new ApiAdapter(fetcher).collect(apiSource);
    assert.equal(result.normalized.length, 1);
    assert.equal(result.normalized[0].canonicalUrl, 'https://api.example/one');
    assert.equal(result.normalized[0].publishedAt, '2026-08-17T00:00:00.000Z');
  });

  test('API maxItems 生效且缺字段不产生文章', async () => {
    const body = JSON.stringify({ data: { items: [{ url: 'https://api.example/one', headline: 'one' }, { url: 'https://api.example/two' }] } });
    const fetcher = fixtureFetcher({ 'https://api.example/news': response(200, body, 'application/json') });
    const result = await new ApiAdapter(fetcher).collect({ ...apiSource, adapterConfig: { ...apiSource.adapterConfig!, maxItems: 1 } });
    assert.equal(result.raw.length, 1);
    assert.equal(result.normalized.length, 1);
  });

  test('API 只保存环境变量名，不接受凭据 URL', () => {
    assert.throws(() => sourceAdapterConfigSchema.parse({ kind: 'api', endpoint: 'https://user:pass@api.example/news', fields: { url: 'url', title: 'title' } }));
    assert.equal(apiAdapterConfigSchema.parse({ ...apiSource.adapterConfig, authEnvVar: 'PUBLIC_API_KEY' }).authEnvVar, 'PUBLIC_API_KEY');
  });

  test('API itemsPath 非数组分类为 parse 错误', async () => {
    const fetcher = fixtureFetcher({ 'https://api.example/news': response(200, JSON.stringify({ data: {} }), 'application/json') });
    await assert.rejects(() => new ApiAdapter(fetcher).fetch(apiSource), (error: unknown) => error instanceof CrawlerError && error.kind === 'parse');
  });
});

describe('Web Adapter and robots', () => {
  const webSource: SourceLike = {
    id: 'source-web',
    type: 'web',
    language: 'en',
    adapterConfig: {
      kind: 'web',
      listingUrl: 'https://web.example/news',
      itemSelector: 'article.card',
      fields: { url: 'a@href', title: 'h2', summary: 'p.summary', publishedAt: 'time@datetime' },
    },
  };

  const html = '<main><article class="card"><a href="/one?utm_medium=x">Read</a><h2>Web headline</h2><p class="summary">Public summary</p><time datetime="2026-08-17T04:00:00Z"></time><script>evil()</script><img onerror="evil()"></article></main>';

  test('Web 先检查 robots，再解析 HTML，并移除脚本文本', async () => {
    const calls: string[] = [];
    const fetcher = fixtureFetcher({
      'https://web.example/robots.txt': response(200, 'User-agent: *\nAllow: /news\nDisallow: /private', 'text/plain'),
      'https://web.example/news': response(200, html, 'text/html'),
    }, calls);
    const result = await new WebAdapter(fetcher).collect(webSource);
    assert.deepEqual(calls, ['https://web.example/robots.txt', 'https://web.example/news']);
    assert.equal(result.normalized[0].canonicalUrl, 'https://web.example/one');
    assert.equal(result.parsed[0].content?.includes('evil'), false);
  });

  test('Web 缺字段项被忽略，不制造伪文章', async () => {
    const fetcher = fixtureFetcher({
      'https://web.example/robots.txt': response(200, 'User-agent: *\nAllow: /', 'text/plain'),
      'https://web.example/news': response(200, '<article class="card"><h2>missing url</h2></article>', 'text/html'),
    });
    const result = await new WebAdapter(fetcher).collect(webSource);
    assert.equal(result.raw.length, 0);
  });

  test('Web robots 禁止时不请求 listing', async () => {
    const calls: string[] = [];
    const fetcher = fixtureFetcher({ 'https://web.example/robots.txt': response(200, 'User-agent: *\nDisallow: /news', 'text/plain') }, calls);
    await assert.rejects(() => new WebAdapter(fetcher).fetch(webSource), (error: unknown) => error instanceof CrawlerError && error.kind === 'robots');
    assert.deepEqual(calls, ['https://web.example/robots.txt']);
  });

  test('robots 规则使用最长匹配并以 Allow 取胜', () => {
    const policy = RobotsPolicy.parse('User-agent: *\nDisallow: /\nAllow: /news/public\nDisallow: /news', 'FinanceHotCrawler/0.1');
    assert.equal(policy.isAllowed('/news/public/item'), true);
    assert.equal(policy.isAllowed('/news/private'), false);
  });

  test('robots 无明确规则默认允许', () => {
    assert.equal(RobotsPolicy.parse('User-agent: Googlebot\nDisallow: /', 'FinanceHotCrawler/0.1').isAllowed('/news'), true);
  });
});

describe('URL 与安全 fetcher', () => {
  test('canonical URL 去掉 fragment 和追踪参数', () => {
    assert.equal(canonicalizeUrl('https://EXAMPLE.com/a?utm_source=x&keep=1#frag'), 'https://example.com/a?keep=1');
  });

  test('拒绝 ftp、凭据 URL 和缺失 scheme', async () => {
    const fetcher = fixtureFetcher({});
    await assert.rejects(() => fetcher.fetch('ftp://example.com/a'), (error: unknown) => error instanceof CrawlerError && error.kind === 'security');
    await assert.rejects(() => fetcher.fetch('https://user:pass@example.com/a'), (error: unknown) => error instanceof CrawlerError && error.kind === 'security');
  });

  test('阻止 IPv4 loopback/private/link-local/CGNAT/metadata/multicast', () => {
    for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '224.0.0.1']) {
      assert.equal(isForbiddenAddress(address), true, address);
    }
  });

  test('阻止 IPv6 loopback/unspecified/ULA/link-local/multicast', () => {
    for (const address of ['::', '::1', 'fc00::1', 'fe80::1', 'ff02::1']) assert.equal(isForbiddenAddress(address), true, address);
  });

  test('阻止 IPv4-mapped IPv6 内网地址', () => {
    assert.equal(isForbiddenAddress('::ffff:127.0.0.1'), true);
    assert.equal(isForbiddenAddress('::ffff:10.0.0.1'), true);
  });

  test('DNS 解析只要包含一个危险 A/AAAA 就整体拒绝', async () => {
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }],
      request: async () => response(200, 'ok', 'text/plain'),
    });
    await assert.rejects(() => fetcher.fetch('https://mixed.example/'), (error: unknown) => error instanceof CrawlerError && error.kind === 'dns');
  });

  test('重定向每一跳重新 DNS 校验', async () => {
    const resolved: string[] = [];
    const fetcher = new SafeFetcher({
      resolve: async (hostname) => {
        resolved.push(hostname);
        return hostname === 'safe.example' ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '10.0.0.1', family: 4 }];
      },
      request: async () => response(302, '', 'text/plain', { location: 'https://private.example/next' }),
    });
    await assert.rejects(() => fetcher.fetch('https://safe.example/start'), (error: unknown) => error instanceof CrawlerError && error.kind === 'dns');
    assert.deepEqual(resolved, ['safe.example', 'private.example']);
  });

  test('重定向跳数受限', async () => {
    const fetcher = fixtureFetcher({
      'https://safe.example/': response(302, '', 'text/plain', { location: 'https://safe.example/next' }),
      'https://safe.example/next': response(302, '', 'text/plain', { location: 'https://safe.example/final' }),
    });
    await assert.rejects(() => fetcher.fetch('https://safe.example/', { maxRedirects: 1 }), (error: unknown) => error instanceof CrawlerError && error.kind === 'security');
  });

  test('响应字节超过上限时拒绝', async () => {
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: new Uint8Array(11) }),
    });
    await assert.rejects(() => fetcher.fetch('https://safe.example/', { maxBytes: 10 }), (error: unknown) => error instanceof CrawlerError && error.kind === 'response_too_large');
  });

  test('Content-Type 不匹配时拒绝', async () => {
    const fetcher = fixtureFetcher({ 'https://safe.example/': response(200, '{}', 'text/html') });
    await assert.rejects(() => fetcher.fetch('https://safe.example/', { allowedContentTypes: /^application\/json$/ }), (error: unknown) => error instanceof CrawlerError && error.kind === 'content_type');
  });

  test('仅对 429 重试并尊重 Retry-After', async () => {
    let count = 0;
    const delays: number[] = [];
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => {
        count += 1;
        return count < 3 ? response(429, '', 'text/plain', { 'retry-after': '2' }) : response(200, 'ok', 'text/plain');
      },
      sleep: async (ms) => { delays.push(ms); },
    });
    const result = await fetcher.fetch('https://safe.example/', { maxAttempts: 3 });
    assert.equal(result.body, 'ok');
    assert.deepEqual(delays, [2000, 2000]);
  });

  test('4xx 非 429 不重试', async () => {
    let count = 0;
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => { count += 1; return response(404, '', 'text/plain'); },
      sleep: async () => { throw new Error('should not sleep'); },
    });
    await assert.rejects(() => fetcher.fetch('https://safe.example/'), (error: unknown) => error instanceof CrawlerError && error.status === 404);
    assert.equal(count, 1);
  });

  test('网络瞬断和 timeout 可重试，成功后返回', async () => {
    let count = 0;
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => {
        count += 1;
        if (count === 1) throw new CrawlerError('timeout', 'timeout', true);
        if (count === 2) throw new Error('socket reset');
        return response(200, 'ok', 'text/plain');
      },
      sleep: async () => undefined,
    });
    assert.equal((await fetcher.fetch('https://safe.example/')).body, 'ok');
    assert.equal(count, 3);
  });

  test('解析或安全错误不重试', async () => {
    let count = 0;
    const fetcher = new SafeFetcher({
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      request: async () => { count += 1; return response(200, '', 'text/html'); },
      sleep: async () => { throw new Error('should not sleep'); },
    });
    await assert.rejects(() => fetcher.fetch('https://safe.example/', { allowedContentTypes: /^application\/json$/ }), CrawlerError);
    assert.equal(count, 1);
  });

  test('按 source 控频，source 之间互不阻塞', async () => {
    let now = 1000;
    const sleeps: number[] = [];
    const limiter = new SourceRateLimiter(100, () => now, async (ms) => { sleeps.push(ms); now += ms; });
    await limiter.wait('a');
    await limiter.wait('a');
    await limiter.wait('b');
    assert.deepEqual(sleeps, [100]);
  });
});

describe('配置契约与 robots 边界', () => {
  test('compliance 需要核验日期、频率并默认只保留摘录', () => {
    const value = sourceComplianceSchema.parse({ checkedAt: '2026-08-17T00:00:00Z', frequency: '每小时最多一次' });
    assert.equal(value.storeExcerptOnly, true);
  });

  test('Web robots 404 允许继续，403 拒绝', async () => {
    const allowed = fixtureFetcher({ 'https://web.example/robots.txt': response(404, '', 'text/plain') });
    await assert.doesNotReject(() => assertRobotsAllowed(allowed, 'https://web.example/news', 'FinanceHotCrawler/0.1'));
    const denied = fixtureFetcher({ 'https://web.example/robots.txt': response(403, '', 'text/plain') });
    await assert.rejects(() => assertRobotsAllowed(denied, 'https://web.example/news', 'FinanceHotCrawler/0.1'), (error: unknown) => error instanceof CrawlerError && error.kind === 'robots');
  });
});
