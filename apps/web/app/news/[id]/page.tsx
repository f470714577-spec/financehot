import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  FinanceScoreBadge,
  MarketImpact,
  SourceBadge,
  Tag,
} from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { getDemoNews } from '@/lib/demo-data';
import { notFound } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const article = getDemoNews((await params).id);
  return {
    title: article ? `${article.title}｜FinanceHot` : '新闻详情｜FinanceHot',
    description: article?.summary ?? 'FinanceHot 新闻详情',
  };
}

export default async function NewsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const article = getDemoNews((await params).id);
  if (!article) notFound();
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[940px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <Link
          href="/news"
          className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-signal-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回全部动态
        </Link>
        <PageHeader
          eyebrow={`${article.dateLabel} · ${article.time} · NEWS DETAIL`}
          title="新闻详情"
          description="单条 Article 保留原始信源证据，同时展示中文摘要、财经重要度和市场影响。"
        />
        <DemoNotice />
        {state === 'empty' ? (
          <EmptyState
            title="这条新闻暂时没有可展示内容"
            description="可能已被隐藏或尚未完成处理。"
          />
        ) : state === 'error' ? (
          <ErrorState title="新闻详情加载失败" description="这是阶段04的错误边界预览。" />
        ) : (
          <article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <SourceBadge name={article.source} level={article.sourceLevel} />
              <span className="text-xs text-ink-muted">{article.relativeTime}</span>
              <FinanceScoreBadge score={article.score} />
              {article.eventStatus && (
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
                    )[article.eventStatus]
                  }
                </span>
              )}
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold leading-9 text-ink sm:text-3xl">
              {article.title}
            </h1>
            <p className="mt-5 text-base leading-8 text-ink-muted">{article.summary}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
            <div className="mt-8 grid gap-5 border-y border-line py-6 md:grid-cols-2">
              <div>
                <div className="mb-3 text-xs font-semibold tracking-[0.12em] text-ink-muted">
                  市场影响
                </div>
                <div className="flex flex-wrap gap-2">
                  <MarketImpact value={article.impact} confidence={article.score / 100} />
                  <span className="rounded-md border border-line bg-surface-muted px-2 py-1 text-xs text-ink-muted">
                    {article.market}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-ink-muted">
                  方向和置信度均为演示字段；不确定时保留“影响待定”，不强行判断多空。
                </p>
              </div>
              <div>
                <div className="mb-3 text-xs font-semibold tracking-[0.12em] text-ink-muted">
                  为什么重要
                </div>
                <p className="border-l-2 border-signal-amber pl-3 text-sm leading-6 text-ink">
                  {article.reason}
                </p>
              </div>
            </div>
            {article.eventId && (
              <section className="mt-8 rounded-md bg-surface-muted/60 p-4">
                <SectionTitle label="EVENT CONTEXT" title="它属于哪个事件" />
                <Link
                  href={`/event/${article.eventId}`}
                  className="flex items-center justify-between gap-4 text-sm font-medium text-signal-blue"
                >
                  <span>{article.eventTitle}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
                <p className="mt-2 text-xs text-ink-muted">
                  另有 {article.relatedSources} 家信源围绕同一事件报道。
                </p>
              </section>
            )}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <span className="text-xs text-ink-muted">
                原文链接在接入真实来源后提供，当前 Demo URL 不指向外部新闻。
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                <ExternalLink className="h-3.5 w-3.5" />
                原文入口预留
              </span>
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
