import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleDot, GitBranch } from 'lucide-react';
import { EmptyState, ErrorState, FinanceScoreBadge, HeatScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { NewsFeed } from '@/components/demo-controls';
import { getDemoEvent } from '@/lib/demo-data';
import { notFound } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const event = getDemoEvent((await params).id);
  return {
    title: event ? `${event.title}｜事件详情｜FinanceHot` : '事件详情｜FinanceHot',
    description: event?.summary ?? 'FinanceHot 事件详情',
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const event = getDemoEvent((await params).id);
  if (!event) notFound();
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1080px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <Link
          href="/hot"
          className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-signal-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回热点榜
        </Link>
        <PageHeader
          eyebrow={`EVENT DETAIL · ${event.firstSeenAt}`}
          title="事件详情"
          description="Event 是多篇 Article 共同指向的财经事实，页面集中呈现多信源证据、状态和时间线。"
        />
        <DemoNotice />
        {state === 'empty' ? (
          <EmptyState title="这个事件暂时没有信源" description="事件聚合完成后才会展示证据列表。" />
        ) : state === 'error' ? (
          <ErrorState title="事件详情加载失败" description="这是阶段04的错误边界预览。" />
        ) : (
          <>
            <article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-signal-cyan/10 px-2 py-1 text-xs text-signal-cyan">
                  事件·
                  {
                    (
                      {
                        confirmed: '已确认',
                        developing: '持续发展',
                        rumor: '未经确认',
                        disputed: '存在争议',
                        retracted: '已撤回',
                      } as const
                    )[event.status]
                  }
                </span>
                <FinanceScoreBadge score={event.finance} />
                <HeatScoreBadge score={event.heat} />
                <span className="ml-auto text-xs text-ink-muted">
                  {event.sources} 家信源 · {event.articleCount} 篇报道
                </span>
              </div>
              <h1 className="mt-5 font-display text-2xl font-bold leading-9 text-ink sm:text-3xl">
                {event.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{event.summary}</p>
              <p className="mt-5 border-l-2 border-signal-amber pl-3 text-sm leading-6 text-ink">
                为什么重要：事件的多信源增长、持续时间和跨市场影响共同决定它的关注价值；Heat Score
                与 Finance Score 分开表达。
              </p>
            </article>
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section>
                <SectionTitle label="SOURCE EVIDENCE" title="多信源报道" />
                <NewsFeed items={event.articles} />
              </section>
              <aside>
                <SectionTitle label="EVENT TIMELINE" title="事件时间线" />
                <div className="relative space-y-6 border-l border-line pl-5">
                  {event.timeline.map((item, index) => (
                    <div key={`${item.time}-${item.label}`} className="relative">
                      <CircleDot
                        className={`absolute -left-[27px] top-0 h-4 w-4 ${index === 0 ? 'text-signal-blue' : 'text-ink-muted'}`}
                      />
                      <div className="font-data text-xs text-ink-muted">{item.time}</div>
                      <h3 className="mt-1 text-sm font-semibold text-ink">{item.label}</h3>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">{item.description}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-md border border-line bg-surface p-4 text-xs leading-5 text-ink-muted">
                  <GitBranch className="mb-2 h-4 w-4 text-signal-blue" />
                  聚合方法：Seed 演示使用标题相似度字段，真实聚类将在后续 Worker 阶段实现。
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
