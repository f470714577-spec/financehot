import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getHomeData } from '@financehot/db';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { EventList } from '@/components/event-list';
import { NewsFeed } from '@/components/news-feed';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FinanceHot｜全球财经情报',
  description: '全球财经情报聚合与 AI 分析平台',
  icons: { icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%230b1b33%22/%3E%3Cpath d=%22M8 23 14 9l4 9 3-5 3 10%22 fill=%22none%22 stroke=%22%23fff%22 stroke-width=%223%22/%3E%3C/svg%3E' },
};

export default async function HomePage() {
  const data = await getHomeData(getDb().db);
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader eyebrow="数据库 Seed · 今日财经情报" title="今日财经情报" description="从全球公开信源中提炼真正影响市场的事件，用更少的时间掌握今天值得关注的财经脉络。">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-l-2 border-signal-blue pl-4 sm:grid-cols-4">
            {[
              ['采集新闻', data.stats.collected],
              ['识别事件', data.stats.events],
              ['AI精选', data.stats.featured],
              ['重大事件', data.stats.majorEvents],
            ].map(([label, value]) => <div key={label as string}><div className="font-data text-xl font-semibold tabular-nums">{value}</div><div className="text-[10px] text-ink-muted">{label}</div></div>)}
          </div>
        </PageHeader>
        <DemoNotice />
        <section className="mb-10">
          <SectionTitle label="TOP 5 · HEAT SCORE" title="今日热点" action={<Link href="/hot" className="inline-flex items-center gap-1 text-xs font-medium text-signal-blue">查看完整榜单<ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <EventList events={data.hot.items} limit={5} />
        </section>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <SectionTitle label="TIME FLOW" title="最新动态" action={<Link href="/news" className="text-xs font-medium text-signal-blue">全部动态</Link>} />
            <NewsFeed items={data.news.items} nextCursor={data.news.nextCursor} hasMore={data.news.hasMore} showCategoryTabs />
          </section>
          <aside className="space-y-5">
            <section className="rounded-lg border border-line bg-surface p-5 shadow-raised">
              <SectionTitle label="阅读路径" title="先看什么" />
              <div className="space-y-3 text-sm">
                {[['/hot', '快速扫一遍热点榜'], ['/daily', '阅读一页财经日报'], ['/topics', '跟踪一个长期主题']].map(([href, label]) => <Link key={href} href={href} className="flex items-center justify-between rounded-md bg-surface-muted/60 px-3 py-2.5 text-ink hover:text-signal-blue"><span>{label}</span><ArrowRight className="h-4 w-4" /></Link>)}
              </div>
            </section>
            <section className="rounded-lg border border-line bg-surface p-5">
              <SectionTitle label="当前范围" title="可信事件聚合" />
              <p className="text-sm leading-6 text-ink-muted">首页优先展示多信源 Event，详情保留每篇 Article 的原始入口；当前数据仍是明确标记的 Seed 版本，不代表实时财经服务。</p>
              <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-md bg-signal-cyan/10 px-2 py-1 text-xs text-signal-cyan">PostgreSQL Seed</span><span className="rounded-md bg-surface-muted px-2 py-1 text-xs text-ink-muted">非实时</span></div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
