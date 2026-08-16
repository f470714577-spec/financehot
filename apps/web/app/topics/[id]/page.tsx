import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { EmptyState, ErrorState, HeatScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { EventList } from '@/components/event-list';
import { NewsFeed } from '@/components/demo-controls';
import { getDemoTopic } from '@/lib/demo-data';
import { notFound } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const topic = getDemoTopic((await params).id);
  return {
    title: topic ? `${topic.name}｜FinanceHot` : '主题详情｜FinanceHot',
    description: topic?.description ?? 'FinanceHot 主题详情',
  };
}

export default async function TopicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const topic = getDemoTopic((await params).id);
  if (!topic) notFound();
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <Link
          href="/topics"
          className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-signal-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回主题列表
        </Link>
        <PageHeader
          eyebrow={`TOPIC · ${topic.slug}`}
          title={topic.name}
          description={topic.description}
        >
          <div className="flex items-center gap-3 border-l-2 border-signal-blue pl-4">
            <HeatScoreBadge score={topic.heatScore} />
            <span className="text-xs text-ink-muted">持续跟踪中</span>
          </div>
        </PageHeader>
        <DemoNotice />
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-line bg-surface p-4">
            <div className="font-data text-xl font-semibold">{topic.newsCount24h}</div>
            <div className="mt-1 text-xs text-ink-muted">24h新闻</div>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <div className="font-data text-xl font-semibold">{topic.eventCount}</div>
            <div className="mt-1 text-xs text-ink-muted">关联事件</div>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <div className="font-data text-xl font-semibold">{topic.countries.length}</div>
            <div className="mt-1 text-xs text-ink-muted">市场范围</div>
          </div>
          <div className="rounded-md border border-line bg-surface p-4">
            <div className="font-data text-xl font-semibold">{topic.categories.length}</div>
            <div className="mt-1 text-xs text-ink-muted">分类覆盖</div>
          </div>
        </div>
        {state === 'empty' ? (
          <EmptyState title="这个主题暂时没有新动态" description="稍后回来查看新的关联事件。" />
        ) : state === 'error' ? (
          <ErrorState title="主题详情加载失败" description="这是阶段04的错误边界预览。" />
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-8">
              <section>
                <SectionTitle label="RELATED EVENTS" title="重要事件" />
                <EventList events={topic.events} />
              </section>
              <section>
                <SectionTitle label="TOPIC FLOW" title="主题时间流" />
                <NewsFeed items={topic.articles} />
              </section>
            </div>
            <aside className="space-y-5">
              <section className="rounded-lg border border-line bg-surface p-5">
                <SectionTitle label="关联范围" title="观察维度" />
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="mb-2 text-xs text-ink-muted">市场</div>
                    <div className="flex flex-wrap gap-2">
                      {topic.countries.map((item) => (
                        <span
                          key={item}
                          className="rounded-md bg-surface-muted px-2 py-1 text-xs text-ink"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs text-ink-muted">分类</div>
                    <div className="flex flex-wrap gap-2">
                      {topic.categories.map((item) => (
                        <span
                          key={item}
                          className="rounded-md bg-surface-muted px-2 py-1 text-xs text-ink"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <Link
                href="/news"
                className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-3 text-xs text-ink-muted hover:text-signal-blue"
              >
                查看全部动态
                <ArrowRight className="h-4 w-4" />
              </Link>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
