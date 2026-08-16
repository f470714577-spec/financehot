import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Tags } from 'lucide-react';
import { EmptyState, ErrorState, HeatScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader } from '@/components/page-header';
import { demoTopicsView } from '@/lib/demo-data';

export const metadata: Metadata = {
  title: '主题追踪｜FinanceHot',
  description: '按主题追踪连续发生的全球财经事件。',
};

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader
          eyebrow="TOPIC TRACKING · SEED VIEW"
          title="主题追踪"
          description="把分散的新闻放回持续发展的主题中，查看热度、关联事件和跨市场线索。"
        />
        <DemoNotice />
        {state === 'empty' ? (
          <EmptyState title="还没有可追踪的主题" description="主题会在积累连续事件后出现。" />
        ) : state === 'error' ? (
          <ErrorState title="主题列表加载失败" description="这是阶段04的错误边界预览。" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {demoTopicsView.map((topic) => (
              <Link
                key={topic.slug}
                href={`/topics/${topic.slug}`}
                className="group rounded-lg border border-line bg-surface p-5 shadow-raised transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-signal-blue/10 text-signal-blue">
                    <Tags className="h-4 w-4" />
                  </div>
                  <HeatScoreBadge score={topic.heatScore} />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold text-ink group-hover:text-signal-blue">
                  {topic.name}
                </h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-ink-muted">
                  {topic.description}
                </p>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
                  <span>
                    {topic.eventCount} 个事件 · {topic.newsCount24h} 条新闻
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-signal-blue" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
