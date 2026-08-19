import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { getNews } from '@financehot/db';
import { EmptyState, ErrorState, FinanceScoreBadge, MarketImpact, SourceBadge, Tag } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function marketLabel(value: string) {
  return ({ china: '中国市场', us: '美国市场', europe: '欧洲市场', japan: '日本市场', global: '全球' } as Record<string, string>)[value] ?? value;
}

function impactFromScore(value: number | null) {
  if (value === null) return 'uncertain' as const;
  if (value >= 80) return 'strong_positive' as const;
  if (value >= 65) return 'positive' as const;
  if (value >= 45) return 'neutral' as const;
  if (value >= 25) return 'negative' as const;
  return 'strong_negative' as const;
}

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '发布时间未知';
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const article = await getNews(getDb().db, (await params).id);
  return { title: article ? `${article.title}｜FinanceHot` : '新闻详情｜FinanceHot', description: article?.summary ?? 'FinanceHot 新闻详情' };
}

export default async function NewsDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const article = await getNews(getDb().db, (await params).id);
  if (!article) notFound();
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[940px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <Link href="/news" className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-signal-blue"><ArrowLeft className="h-3.5 w-3.5" />返回全部动态</Link>
        <PageHeader eyebrow={`${dateText(article.publishedAt)} · NEWS DETAIL`} title="新闻详情" description="单条 Article 保留数据库中的信源证据，同时展示中文摘要、财经重要度和市场影响。" />
        <DemoNotice />
        {state === 'empty' ? <EmptyState title="这条新闻暂时没有可展示内容" description="可能已被隐藏或尚未完成处理。" /> : state === 'error' ? <ErrorState title="新闻详情加载失败" description="数据库查询暂时不可用，请稍后重试。" /> : <article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-8">
          <div className="flex flex-wrap items-center gap-3"><SourceBadge name={article.source.name} /><span className="text-xs text-ink-muted">{dateText(article.publishedAt)}</span><FinanceScoreBadge score={article.score} />{article.event && <span className="rounded-md bg-signal-cyan/10 px-2 py-1 text-xs text-signal-cyan">事件·{article.event.status === 'confirmed' ? '已确认' : article.event.status === 'developing' ? '持续发展' : article.event.status}</span>}</div>
          <h1 className="mt-6 font-display text-2xl font-bold leading-9 text-ink sm:text-3xl">{article.title}</h1>
          <p className="mt-5 text-base leading-8 text-ink-muted">{article.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">{article.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
          <div className="mt-8 grid gap-5 border-y border-line py-6 md:grid-cols-2">
            <div><div className="mb-3 text-xs font-semibold tracking-[0.12em] text-ink-muted">市场影响</div><div className="flex flex-wrap gap-2"><MarketImpact value={impactFromScore(article.marketImpactScore)} confidence={article.score / 100} /><span className="rounded-md border border-line bg-surface-muted px-2 py-1 text-xs text-ink-muted">{marketLabel(article.market)}</span></div><p className="mt-3 text-xs leading-5 text-ink-muted">方向基于数据库中的市场影响评分；Seed 版本仅用于验证页面和 API 链路。</p></div>
            <div><div className="mb-3 text-xs font-semibold tracking-[0.12em] text-ink-muted">为什么重要</div><p className="border-l-2 border-signal-amber pl-3 text-sm leading-6 text-ink">{article.reason ?? '数据库尚未提供分析说明。'}</p></div>
          </div>
          {article.event && <section className="mt-8 rounded-md bg-surface-muted/60 p-4"><SectionTitle label="EVENT CONTEXT" title="它属于哪个事件" /><Link href={`/event/${article.event.id}`} className="flex items-center justify-between gap-4 text-sm font-medium text-signal-blue"><span>{article.event.title}</span><ArrowRight className="h-4 w-4 shrink-0" /></Link><p className="mt-2 text-xs text-ink-muted">另有 {article.relatedSources} 家信源围绕同一事件报道。</p></section>}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><span className="text-xs text-ink-muted">原文链接由来源数据提供；当前 Seed URL 不指向外部新闻。</span><span className="inline-flex items-center gap-1 text-xs text-ink-muted"><ExternalLink className="h-3.5 w-3.5" />原文入口预留</span></div>
        </article>}
      </div>
    </AppShell>
  );
}
