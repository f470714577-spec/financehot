import { sources, type Db } from '@financehot/db';
import type { SourceAdapterConfigInput } from '@financehot/shared';
import { inArray } from 'drizzle-orm';

type WorkerDb = Db['db'];

const compliance = (robotsUrl: string, termsUrl: string, frequency: string) => ({
  robotsUrl,
  termsUrl,
  checkedAt: '2026-08-17T00:00:00+08:00',
  frequency,
  storeExcerptOnly: true as const,
});

export const stage06Sources: Array<typeof sources.$inferInsert> = [
  {
    name: 'Federal Reserve Press Releases',
    type: 'rss',
    country: 'US',
    language: 'en',
    homepage: 'https://www.federalreserve.gov/feeds/feeds.htm',
    rss_url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    source_level: 'A',
    credibility_score: 98,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.federalreserve.gov/feeds/press_all.xml',
      maxItems: 50,
      compliance: compliance('https://www.federalreserve.gov/robots.txt', 'https://www.federalreserve.gov/website-policies.htm', '每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'Federal Reserve Monetary Policy',
    type: 'rss',
    country: 'US',
    language: 'en',
    homepage: 'https://www.federalreserve.gov/feeds/feeds.htm',
    rss_url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    source_level: 'A',
    credibility_score: 98,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
      maxItems: 30,
      compliance: compliance('https://www.federalreserve.gov/robots.txt', 'https://www.federalreserve.gov/website-policies.htm', '每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'European Central Bank Press Releases',
    type: 'rss',
    country: 'EU',
    language: 'en',
    homepage: 'https://www.ecb.europa.eu/home/html/rss.pl.html',
    rss_url: 'https://www.ecb.europa.eu/rss/press.html',
    source_level: 'A',
    credibility_score: 98,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.ecb.europa.eu/rss/press.html',
      maxItems: 50,
      compliance: compliance('https://www.ecb.europa.eu/robots.txt', 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html', '遵守 robots Crawl-delay 5 秒，每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'Federal Reserve Policy Rates',
    type: 'rss',
    country: 'US',
    language: 'en',
    homepage: 'https://www.federalreserve.gov/feeds/feeds.htm',
    rss_url: 'https://www.federalreserve.gov/feeds/prates.xml',
    source_level: 'A',
    credibility_score: 98,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.federalreserve.gov/feeds/prates.xml',
      maxItems: 30,
      compliance: compliance('https://www.federalreserve.gov/robots.txt', 'https://www.federalreserve.gov/website-policies.htm', '每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'European Central Bank Statistical Press Releases',
    type: 'rss',
    country: 'EU',
    language: 'en',
    homepage: 'https://www.ecb.europa.eu/home/html/rss.pl.html',
    rss_url: 'https://www.ecb.europa.eu/rss/statpress.html',
    source_level: 'A',
    credibility_score: 98,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.ecb.europa.eu/rss/statpress.html',
      maxItems: 30,
      compliance: compliance('https://www.ecb.europa.eu/robots.txt', 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html', '遵守 robots Crawl-delay 5 秒，每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'European Central Bank Blog Posts',
    type: 'rss',
    country: 'EU',
    language: 'en',
    homepage: 'https://www.ecb.europa.eu/home/html/rss.pl.html',
    rss_url: 'https://www.ecb.europa.eu/rss/blog.html',
    source_level: 'A',
    credibility_score: 97,
    enabled: true,
    crawl_interval: 3_600,
    adapter_config: {
      kind: 'rss',
      feedUrl: 'https://www.ecb.europa.eu/rss/blog.html',
      maxItems: 30,
      compliance: compliance('https://www.ecb.europa.eu/robots.txt', 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html', '遵守 robots Crawl-delay 5 秒，每小时最多一次'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'US Bureau of Labor Statistics Economic Releases Web',
    type: 'web',
    country: 'US',
    language: 'en',
    homepage: 'https://www.bls.gov/news.release/',
    source_level: 'A',
    credibility_score: 96,
    enabled: false,
    crawl_interval: 86_400,
    adapter_config: {
      kind: 'web',
      listingUrl: 'https://www.bls.gov/news.release/',
      itemSelector: 'main li',
      fields: { url: 'a@href', title: 'a', publishedAt: 'time@datetime' },
      maxItems: 20,
      compliance: compliance('https://www.bls.gov/robots.txt', 'https://www.bls.gov/bls/blsterms.htm', '低频：每日一次；不访问 robots 禁止路径'),
    } satisfies SourceAdapterConfigInput,
  },
  {
    name: 'Federal Reserve Press Releases Web',
    type: 'web',
    country: 'US',
    language: 'en',
    homepage: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
    source_level: 'A',
    credibility_score: 98,
    enabled: false,
    crawl_interval: 86_400,
    adapter_config: {
      kind: 'web',
      listingUrl: 'https://www.federalreserve.gov/newsevents/pressreleases.htm',
      itemSelector: 'a[href*="/newsevents/pressreleases/"]',
      fields: { url: 'a[href*="/newsevents/pressreleases/"]@href', title: 'a[href*="/newsevents/pressreleases/"]' },
      maxItems: 20,
      compliance: compliance('https://www.federalreserve.gov/robots.txt', 'https://www.federalreserve.gov/website-policies.htm', '低频：每日一次；RSS 优先，Web 仅作低频兜底'),
    } satisfies SourceAdapterConfigInput,
  },
];

export async function installStage06Sources(db: WorkerDb): Promise<number> {
  if (stage06Sources.length < 5 || stage06Sources.length > 10) throw new Error('阶段06来源数量必须在 5–10 之间');
  await db
    .update(sources)
    .set({ enabled: false, updated_at: new Date() })
    .where(inArray(sources.name, [
      'Bank for International Settlements Press Releases',
      'Bank for International Settlements Statistics',
    ]));
  const rows = await db
    .insert(sources)
    .values(stage06Sources)
    .onConflictDoUpdate({
      target: sources.name,
      set: {
        type: sources.type,
        country: sources.country,
        language: sources.language,
        homepage: sources.homepage,
        rss_url: sources.rss_url,
        source_level: sources.source_level,
        credibility_score: sources.credibility_score,
        enabled: sources.enabled,
        crawl_interval: sources.crawl_interval,
        adapter_config: sources.adapter_config,
        updated_at: new Date(),
      },
    })
    .returning({ id: sources.id });
  return rows.length;
}
