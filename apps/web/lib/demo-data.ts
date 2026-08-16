import {
  demoCategories,
  demoDailyReport,
  demoEvents,
  demoSources,
  demoStandaloneArticles,
  demoTopics,
} from '@financehot/db/seed-data';

export type DemoMarket = '中国市场' | '美国市场' | '欧洲市场' | '日本市场' | '全球';
export type DemoImpact =
  'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative' | 'uncertain';

export interface DemoNewsView {
  id: string;
  eventId?: string;
  eventTitle?: string;
  eventStatus?: 'confirmed' | 'developing' | 'rumor' | 'disputed' | 'retracted';
  dateKey: string;
  dateLabel: string;
  time: string;
  relativeTime: string;
  source: string;
  sourceLevel: 'A' | 'B' | 'C' | 'D' | 'E';
  title: string;
  summary: string;
  score: number;
  heat?: number;
  impact: DemoImpact;
  market: DemoMarket;
  categorySlug: string;
  categoryName: string;
  tags: string[];
  relatedSources: number;
  reason: string;
  featured: boolean;
}

export interface DemoEventView {
  id: string;
  title: string;
  summary: string;
  status: 'confirmed' | 'developing' | 'rumor' | 'disputed' | 'retracted';
  finance: number;
  heat: number;
  sources: number;
  articleCount: number;
  updatedAt: string;
  firstSeenAt: string;
  topicSlugs: string[];
  primaryArticleId: string;
  articles: DemoNewsView[];
  timeline: Array<{ time: string; label: string; description: string }>;
}

export interface DemoTopicView {
  slug: string;
  name: string;
  description: string;
  heatScore: number;
  newsCount24h: number;
  eventCount: number;
  countries: string[];
  categories: string[];
  events: DemoEventView[];
  articles: DemoNewsView[];
}

export const DEMO_NOW = new Date('2026-08-16T10:42:00+08:00');

const sourceLevels = demoSources.map((source) => source.sourceLevel);
const sourceNames = demoSources.map((source) => source.name);
const categoryNames = new Map(demoCategories.map((category) => [category.slug, category.name]));

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dateParts(hoursAgo: number): { dateKey: string; dateLabel: string; time: string } {
  const date = new Date(DEMO_NOW.getTime() - hoursAgo * 60 * 60 * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    dateKey: `${date.getFullYear()}-${pad(month)}-${pad(day)}`,
    dateLabel: `${pad(month)} / ${pad(day)}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function relativeTime(hoursAgo: number): string {
  if (hoursAgo < 1) return '刚刚';
  if (hoursAgo < 24) return `${hoursAgo} 小时前`;
  return `${Math.floor(hoursAgo / 24)} 天前`;
}

function marketFromCountries(countryCodes: string[]): DemoMarket {
  if (countryCodes.includes('CN') || countryCodes.includes('HK')) return '中国市场';
  if (countryCodes.includes('US')) return '美国市场';
  if (countryCodes.includes('DE') || countryCodes.includes('FR') || countryCodes.includes('GB'))
    return '欧洲市场';
  if (countryCodes.includes('JP')) return '日本市场';
  return '全球';
}

function impactFromArticle(title: string, categorySlug: string): DemoImpact {
  if (title.includes('波动') || title.includes('争议') || categorySlug === 'trade')
    return 'uncertain';
  if (
    title.includes('上涨') ||
    title.includes('超预期') ||
    title.includes('降准') ||
    title.includes('降息')
  )
    return 'positive';
  if (title.includes('下跌') || title.includes('承压') || title.includes('加征')) return 'negative';
  return 'neutral';
}

function reasonForArticle(title: string, categoryName: string): string {
  if (title.includes('美联储') || title.includes('央行'))
    return '利率与流动性变化会沿着汇率、债券和风险资产估值链条传导。';
  if (title.includes('芯片') || title.includes('AI'))
    return '算力与半导体供需变化会影响科技企业资本开支和产业链定价。';
  if (title.includes('油价') || title.includes('黄金') || categoryName === '大宗商品')
    return '大宗商品价格变化会影响通胀预期、企业成本和相关资产表现。';
  if (title.includes('贸易') || title.includes('关税'))
    return '贸易政策变化可能重塑跨境成本、供应链与企业盈利预期。';
  return `${categoryName}领域的最新进展，值得结合后续数据和多信源确认观察。`;
}

function articleView(
  article: {
    sourceIndex: number;
    categorySlug: string;
    tagNames: string[];
    countryCodes: string[];
    titleZh: string;
    summaryZh: string;
    financeScore: number;
    marketImpactScore: number;
    hoursAgo: number;
    featured?: boolean;
  },
  id: string,
  event?: {
    id: string;
    title: string;
    status: DemoEventView['status'];
    articleCount: number;
    heat: number;
  },
): DemoNewsView {
  const parts = dateParts(article.hoursAgo);
  const categoryName = categoryNames.get(article.categorySlug) ?? '财经资讯';
  return {
    id,
    eventId: event?.id,
    eventTitle: event?.title,
    eventStatus: event?.status,
    dateKey: parts.dateKey,
    dateLabel: parts.dateLabel,
    time: parts.time,
    relativeTime: relativeTime(article.hoursAgo),
    source: sourceNames[article.sourceIndex],
    sourceLevel: sourceLevels[article.sourceIndex],
    title: article.titleZh,
    summary: article.summaryZh,
    score: article.financeScore,
    heat: event?.heat,
    impact: impactFromArticle(article.titleZh, article.categorySlug),
    market: marketFromCountries(article.countryCodes),
    categorySlug: article.categorySlug,
    categoryName,
    tags: article.tagNames,
    relatedSources: event ? Math.max(0, event.articleCount - 1) : 0,
    reason: reasonForArticle(article.titleZh, categoryName),
    featured: article.featured ?? false,
  };
}

const eventDrafts = demoEvents.map((event, eventIndex) => ({
  id: `demo-event-${eventIndex}`,
  title: event.title,
  summary: event.summary,
  status: event.status,
  finance: Math.max(...event.articles.map((article) => article.financeScore)),
  heat: Math.min(99, 45 + event.articles.length * 6),
  sources: new Set(event.articles.map((article) => article.sourceIndex)).size,
  articleCount: event.articles.length,
  topicSlugs: event.topicSlugs,
  firstSeenHoursAgo: event.firstSeenHoursAgo,
}));

export const demoEventsView: DemoEventView[] = eventDrafts.map((event, eventIndex) => {
  const articleViews = demoEvents[eventIndex].articles.map((article, articleIndex) =>
    articleView(article, `demo-article-event-${eventIndex}-${articleIndex}`, event),
  );
  const firstSeen = dateParts(event.firstSeenHoursAgo);
  const primaryArticle = articleViews[demoEvents[eventIndex].primaryArticleIndex];
  return {
    ...event,
    updatedAt: `${articleViews[0].relativeTime}更新`,
    firstSeenAt: `${firstSeen.dateLabel} ${firstSeen.time}`,
    primaryArticleId: primaryArticle.id,
    articles: articleViews,
    timeline: [
      {
        time: firstSeen.time,
        label: '首次报道',
        description: `${articleViews[0].source}发布首条相关报道。`,
      },
      {
        time: articleViews[0].time,
        label: '多信源跟进',
        description: `已有 ${event.sources} 家信源交叉报道，系统标记为演示聚合事件。`,
      },
      {
        time: articleViews[0].time,
        label: '市场解读',
        description: '市场影响与重要度评分仅用于演示页面结构，不构成投资建议。',
      },
    ],
  };
});

const eventArticles = demoEventsView.flatMap((event) => event.articles);
const standaloneArticles = demoStandaloneArticles.map((article, articleIndex) =>
  articleView(article, `demo-article-standalone-${articleIndex}`),
);

export const demoNewsView: DemoNewsView[] = [...eventArticles, ...standaloneArticles].sort((a, b) =>
  `${b.dateKey} ${b.time}`.localeCompare(`${a.dateKey} ${a.time}`),
);

export function getDemoNews(id: string): DemoNewsView | undefined {
  return demoNewsView.find((article) => article.id === id);
}

export function getDemoEvent(id: string): DemoEventView | undefined {
  return demoEventsView.find((event) => event.id === id);
}

export const demoTopicsView: DemoTopicView[] = demoTopics
  .map((topic) => {
    const events = demoEventsView.filter((event) => event.topicSlugs.includes(topic.slug));
    const articles = events
      .flatMap((event) => event.articles)
      .filter((article) => article.dateKey === '2026-08-16');
    return {
      slug: topic.slug,
      name: topic.name,
      description: topic.description,
      heatScore: topic.heatScore,
      newsCount24h: articles.length,
      eventCount: events.length,
      countries: [...new Set(articles.map((article) => article.market))],
      categories: [...new Set(articles.map((article) => article.categoryName))],
      events,
      articles,
    };
  })
  .sort((a, b) => b.heatScore - a.heatScore);

export function getDemoTopic(slug: string): DemoTopicView | undefined {
  return demoTopicsView.find((topic) => topic.slug === slug);
}

export const demoStats = {
  collected: demoNewsView.length,
  valid: demoNewsView.length,
  events: demoEventsView.length,
  featured: demoNewsView.filter((article) => article.featured).length,
  majorEvents: demoEventsView.filter((event) => event.finance >= 90).length,
};

export const demoHotEvents = [...demoEventsView].sort(
  (a, b) => b.heat - a.heat || b.finance - a.finance,
);

export const demoCategoriesView = demoCategories.map((category) => ({
  slug: category.slug,
  name: category.name,
}));

const reportContent = demoDailyReport.content as {
  summary: string;
  topItems: Array<{ title: string; score: number }>;
  sections: Array<{ name: string; items: string[] }>;
};

export const demoReport = {
  date: demoDailyReport.date,
  timezone: demoDailyReport.timezone,
  summary: reportContent.summary.replace(/^\[Demo\]\s*/, ''),
  topItems: reportContent.topItems,
  sections: reportContent.sections,
};
