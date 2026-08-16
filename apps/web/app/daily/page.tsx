import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Clock3 } from 'lucide-react';
import { EmptyState, ErrorState, FinanceScoreBadge } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { demoHotEvents, demoReport } from '@/lib/demo-data';

export const metadata: Metadata = {
  title: '财经日报｜FinanceHot',
  description: '用一页内容快速掌握今日全球财经重点。',
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader
          eyebrow="DAILY BRIEF · 2026 / 08 / 13"
          title="财经日报"
          description="1分钟看完今日财经：用事件而不是新闻数量压缩信息，重点保留跨市场、跨地区的传导线索。"
        />
        <DemoNotice />
        {state === 'empty' ? (
          <EmptyState title="今天还没有生成日报" description="日报将在有足够已入库事件后生成。" />
        ) : state === 'error' ? (
          <ErrorState title="日报暂时不可用" description="这是阶段04的错误边界预览。" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <article className="rounded-lg border border-line bg-surface p-5 shadow-raised sm:p-7">
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <BookOpenText className="h-4 w-4 text-signal-blue" />
                演示日报 · Asia/Shanghai
              </div>
              <p className="mt-5 border-l-2 border-signal-blue pl-4 text-lg font-medium leading-8 text-ink">
                {demoReport.summary}
              </p>
              <section className="mt-8">
                <SectionTitle label="TOP STORIES" title="今日最重要的事" />
                <div className="divide-y divide-line rounded-md border border-line">
                  {demoReport.topItems.map((item, index) => (
                    <div key={item.title} className="flex items-center gap-4 px-4 py-4">
                      <span className="font-data text-lg font-semibold text-signal-blue">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                        {item.title}
                      </span>
                      <FinanceScoreBadge score={item.score} />
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-8 space-y-6">
                {demoReport.sections.map((section) => (
                  <div key={section.name}>
                    <h3 className="mb-3 border-l-2 border-signal-cyan pl-3 text-sm font-semibold text-ink">
                      {section.name}
                    </h3>
                    <ul className="space-y-2 text-sm leading-6 text-ink-muted">
                      {section.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-cyan" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </article>
            <aside className="space-y-5">
              <section className="rounded-lg border border-line bg-surface p-5">
                <SectionTitle label="REPORT META" title="生成信息" />
                <dl className="space-y-3 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">日期</dt>
                    <dd className="font-data text-ink">{demoReport.date}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">时区</dt>
                    <dd className="font-data text-ink">{demoReport.timezone}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-muted">内容来源</dt>
                    <dd className="text-right text-ink">已入库演示 Event</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-xs text-ink-muted">
                  <Clock3 className="h-3.5 w-3.5" />
                  生成模型与 Prompt 版本将在真实日报 API 中展示
                </div>
              </section>
              <section className="rounded-lg border border-line bg-surface p-5">
                <SectionTitle label="继续阅读" title="相关热点" />
                <div className="space-y-2">
                  {demoHotEvents.slice(0, 3).map((event) => (
                    <Link
                      key={event.id}
                      href={`/event/${event.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-xs text-ink-muted hover:bg-surface-muted hover:text-signal-blue"
                    >
                      <span className="line-clamp-2">{event.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}
        <p className="mt-8 text-center text-xs leading-5 text-ink-muted">
          日报内容基于已入库 Event 的演示数据，不代表真实市场事实。
        </p>
      </div>
    </AppShell>
  );
}
