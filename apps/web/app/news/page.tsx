import type { Metadata } from 'next';
import { newsQuerySchema, searchQuerySchema } from '@financehot/shared';
import { EmptyState, ErrorState } from '@financehot/ui';
import { listNews } from '@financehot/db';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader } from '@/components/page-header';
import { NewsFeed } from '@/components/news-feed';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '全部动态｜FinanceHot', description: '按时间、市场、分类、来源和 Finance Score 浏览全球财经动态。' };
type SearchParams = Record<string, string | string[] | undefined>;

function queryObject(input: SearchParams) {
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []));
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const raw = queryObject(params);
  const isSearch = typeof raw.q === 'string' && raw.q.length > 0;
  const parsed = isSearch ? searchQuerySchema.safeParse(raw) : newsQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : { limit: 20 };
  const state = raw.state;
  const data = state ? null : await listNews(getDb().db, query);
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader eyebrow="ALL NEWS · POSTGRESQL SEED" title="全部动态" description="按时间倒序查看已入库的财经新闻；筛选、中文搜索和加载更多都通过公开 API 读取数据库。" />
        <DemoNotice />
        {state === 'empty' ? <EmptyState title="当前筛选没有结果" description="调整时间、市场、分类或评分条件后再试。" /> : state === 'error' ? <ErrorState title="新闻查询失败" description="数据库查询暂时不可用，请稍后重试。" /> : <NewsFeed items={data!.items} nextCursor={data!.nextCursor} hasMore={data!.hasMore} showFilters showCategoryTabs initialQuery={{ q: raw.q, category: raw.category, market: raw.market, source: raw.source, minScore: raw.minScore, from: raw.from }} />}
      </div>
    </AppShell>
  );
}
