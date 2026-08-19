import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleDot, GitBranch } from 'lucide-react';
import { getEvent } from '@financehot/db';
import { EmptyState, ErrorState, FinanceScoreBadge, HeatScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { NewsFeed } from '@/components/news-feed';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const eventIcon = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%230b1b33%22/%3E%3Cpath d=%22M8 23 14 9l4 9 3-5 3 10%22 fill=%22none%22 stroke=%22%23fff%22 stroke-width=%223%22/%3E%3C/svg%3E';

function statusLabel(value: string) {
  return ({ confirmed: '已确认', developing: '持续发展', rumor: '未经确认', disputed: '存在争议', retracted: '已撤回' } as Record<string, string>)[value] ?? value;
}

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '时间未知';
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const event = await getEvent(getDb().db, (await params).id);
  return { title: event ? `${event.title}｜事件详情｜FinanceHot` : '事件详情｜FinanceHot', description: event?.summary ?? 'FinanceHot 事件详情', icons: { icon: eventIcon } };
}

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const event = await getEvent(getDb().db, (await params).id);
  if (!event) notFound();
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1080px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <Link href="/hot" className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-signal-blue"><ArrowLeft className="h-3.5 w-3.5" />返回热点榜</Link>
        <PageHeader eyebrow={`EVENT DETAIL · ${dateText(event.firstSeenAt)}`} title="事件详情" description="Event 是多篇 Article 共同指向的财经事实，页面集中呈现多信源证据、状态和时间线。" />
        <DemoNotice />
        {state === 'empty' ? <EmptyState title="这个事件暂时没有信源" description="事件聚合完成后才会展示证据列表。" /> : state === 'error' ? <ErrorState title="事件详情加载失败" description="数据库查询暂时不可用，请稍后重试。" /> : <>
          <article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-signal-cyan/10 px-2 py-1 text-xs text-signal-cyan">事件·{statusLabel(event.status)}</span><FinanceScoreBadge score={event.financeScore ?? 0} /><HeatScoreBadge score={event.heatScore ?? 0} /><span className="ml-auto text-xs text-ink-muted">{event.sourceCount} 家信源 · {event.articleCount} 篇报道</span></div><h1 className="mt-5 font-display text-2xl font-bold leading-9 text-ink sm:text-3xl">{event.title}</h1><p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{event.summary ?? '暂无事件摘要，等待更多事实证据。'}</p><p className="mt-4 text-sm font-medium text-signal-blue">另有 {Math.max(event.sourceCount - 1, 0)} 家信源报道</p><p className="mt-5 border-l-2 border-signal-amber pl-3 text-sm leading-6 text-ink">事实状态、报道时间线和信源质量共同决定事件可信度；Heat Score 与 Finance Score 分开表达。</p></article>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"><section><SectionTitle label="SOURCE EVIDENCE" title="多信源报道" /><NewsFeed items={event.articles} /></section><aside><SectionTitle label="EVENT TIMELINE" title="事件时间线" /><div className="relative space-y-6 border-l border-line pl-5">{event.timeline.map((item, index) => <div key={item.id} className="relative"><CircleDot className={`absolute -left-[27px] top-0 h-4 w-4 ${index === 0 ? 'text-signal-blue' : 'text-ink-muted'}`} /><div className="font-data text-xs text-ink-muted">{dateText(item.occurredAt)}</div><h3 className="mt-1 text-sm font-semibold text-ink">{item.type}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{item.description ?? '暂无说明'}</p></div>)}</div><div className="mt-6 rounded-md border border-line bg-surface p-4 text-xs leading-5 text-ink-muted"><GitBranch className="mb-2 h-4 w-4 text-signal-blue" />Event 与 Article 的关系唯一读取 event_articles；每条关系保留聚类方法、相似度和置信度，页面只展示已落库的事实。</div></aside></div>
        </>}
      </div>
    </AppShell>
  );
}
