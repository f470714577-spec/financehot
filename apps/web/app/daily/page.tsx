import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Clock3 } from 'lucide-react';
import { getDaily } from '@financehot/db';
import { EmptyState, ErrorState, FinanceScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '财经日报｜FinanceHot', description: '用一页内容快速掌握今日全球财经重点。' };

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ state?: string; date?: string }> }) {
  const params = await searchParams;
  const report = params.state ? null : await getDaily(getDb().db, { date: params.date });
  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader eyebrow={report ? `DAILY BRIEF · ${report.date}` : 'DAILY BRIEF · POSTGRESQL SEED'} title="财经日报" description="1分钟看完已入库财经重点：用事件而不是新闻数量压缩信息，保留跨市场、跨地区的传导线索。" />
        <DemoNotice />
        {params.state === 'empty' || (!params.state && !report) ? <EmptyState title="今天还没有生成日报" description="日报将在有足够已入库事件后生成。" /> : params.state === 'error' ? <ErrorState title="日报暂时不可用" description="数据库查询暂时不可用，请稍后重试。" /> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-7"><div className="flex items-center gap-2 text-xs text-ink-muted"><BookOpenText className="h-4 w-4 text-signal-blue" />数据库日报 · {report!.timezone}</div><p className="mt-5 border-l-2 border-signal-blue pl-4 text-lg font-medium leading-8 text-ink">{report!.summary}</p><section className="mt-8"><SectionTitle label="TOP STORIES" title="今日最重要的事" /><div className="divide-y divide-line rounded-md border border-line">{report!.topItems.map((item, index) => <div key={item.title} className="flex items-center gap-4 px-4 py-4"><span className="font-data text-lg font-semibold text-signal-blue">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 text-sm font-medium text-ink">{item.title}</span><FinanceScoreBadge score={item.score} /></div>)}</div></section><section className="mt-8 space-y-6">{report!.sections.map((section) => <div key={section.name}><h3 className="mb-3 border-l-2 border-signal-cyan pl-3 text-sm font-semibold text-ink">{section.name}</h3><ul className="space-y-2 text-sm leading-6 text-ink-muted">{section.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-cyan" />{item}</li>)}</ul></div>)}</section></article><aside className="space-y-5"><section className="rounded-lg border border-line bg-surface p-5"><SectionTitle label="REPORT META" title="生成信息" /><dl className="space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-ink-muted">日期</dt><dd className="font-data text-ink">{report!.date}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">时区</dt><dd className="font-data text-ink">{report!.timezone}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">内容来源</dt><dd className="text-right text-ink">PostgreSQL Seed Event</dd></div></dl><div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-muted"><Clock3 className="h-3.5 w-3.5" />模型与 Prompt 版本来自日报记录</div></section><section className="rounded-lg border border-line bg-surface p-5"><SectionTitle label="继续阅读" title="相关热点" /><div className="space-y-2">{report!.relatedEvents.map((event) => <Link key={event.id} href={`/event/${event.id}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-xs text-ink-muted hover:bg-surface-muted hover:text-signal-blue"><span className="line-clamp-2">{event.title}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" /></Link>)}</div></section></aside></div>}
        <p className="mt-8 text-center text-xs leading-5 text-ink-muted">日报内容来自已入库 Event 的 Seed 数据，不代表实时市场事实或投资建议。</p>
      </div>
    </AppShell>
  );
}
