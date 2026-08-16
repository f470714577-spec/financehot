import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import { EmptyState, ErrorState, HeatScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader } from '@/components/page-header';
import { EventList } from '@/components/event-list';
import { demoHotEvents } from '@/lib/demo-data';

export const metadata: Metadata = {
  title: '热点榜｜FinanceHot',
  description: '按时间窗口查看正在升温的全球财经事件。',
};

const windows = [
  ['1h', '1小时'],
  ['3h', '3小时'],
  ['6h', '6小时'],
  ['12h', '12小时'],
  ['24h', '24小时'],
  ['7d', '7天'],
] as const;

export default async function HotPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; state?: string }>;
}) {
  const params = await searchParams;
  const selectedWindow = windows.some(([value]) => value === params.window) ? params.window : '3h';
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader
          eyebrow={`HEAT RANKING · ${selectedWindow}`}
          title="全球财经热点榜"
          description="Heat Score 代表事件是否正在迅速升温，与 Finance Score 分开表达。当前窗口切换是 Seed 数据版的交互骨架。"
        />
        <DemoNotice />
        <div
          className="mb-6 flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-3 shadow-raised"
          aria-label="热点时间窗口"
        >
          {windows.map(([value, label]) => (
            <Link
              key={value}
              href={`/hot?window=${value}`}
              className={`rounded-md px-3 py-2 text-xs font-medium ${selectedWindow === value ? 'bg-signal-blue text-white' : 'bg-surface-muted text-ink-muted hover:text-ink'}`}
            >
              <span className="font-data">{value}</span>
              <span className="ml-1">{label}</span>
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-2 px-2 text-xs text-ink-muted">
            <Flame className="h-4 w-4 text-market-up" />
            按热度、增长速度和多信源综合排序
          </div>
        </div>
        {params.state === 'empty' ? (
          <EmptyState title="这个时间窗口暂无热点" description="切换更长时间窗口后再试。" />
        ) : params.state === 'error' ? (
          <ErrorState title="热点榜加载失败" description="这是阶段04的错误边界预览。" />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
              当前展示 <HeatScoreBadge score={demoHotEvents[0]?.heat ?? 0} /> 最高热度事件优先
            </div>
            <EventList events={demoHotEvents} />
          </>
        )}
      </div>
    </AppShell>
  );
}
