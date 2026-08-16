import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader, SectionTitle } from '@/components/page-header';
import { EventList } from '@/components/event-list';
import { NewStoriesNotice, NewsFeed } from '@/components/demo-controls';
import { demoHotEvents, demoNewsView, demoStats } from '@/lib/demo-data';

export default function HomePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader
          eyebrow="2026年8月16日 · 星期日"
          title="今日财经情报"
          description="从全球公开信源中提炼真正影响市场的事件，用更少的时间掌握今天值得关注的财经脉络。"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-l-2 border-signal-blue pl-4 sm:grid-cols-4">
            {[
              ['采集新闻', demoStats.collected],
              ['识别事件', demoStats.events],
              ['AI精选', demoStats.featured],
              ['重大事件', demoStats.majorEvents],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="font-data text-xl font-semibold tabular-nums">{value}</div>
                <div className="text-[10px] text-ink-muted">{label}</div>
              </div>
            ))}
          </div>
        </PageHeader>

        <DemoNotice />
        <NewStoriesNotice />

        <section className="mb-10">
          <SectionTitle
            label="TOP 5 · HEAT SCORE"
            title="今日热点"
            action={
              <Link
                href="/hot"
                className="inline-flex items-center gap-1 text-xs font-medium text-signal-blue"
              >
                查看完整榜单
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <EventList events={demoHotEvents} limit={5} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <SectionTitle
              label="TIME FLOW"
              title="最新动态"
              action={
                <Link href="/news" className="text-xs font-medium text-signal-blue">
                  全部动态
                </Link>
              }
            />
            <NewsFeed items={demoNewsView.slice(0, 30)} showCategoryTabs />
          </section>

          <aside className="space-y-5">
            <section className="rounded-lg border border-line bg-surface p-5 shadow-raised">
              <SectionTitle label="阅读路径" title="先看什么" />
              <div className="space-y-3 text-sm">
                <Link
                  href="/hot"
                  className="flex items-center justify-between rounded-md bg-surface-muted/60 px-3 py-2.5 text-ink hover:text-signal-blue"
                >
                  <span>快速扫一遍热点榜</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/daily"
                  className="flex items-center justify-between rounded-md bg-surface-muted/60 px-3 py-2.5 text-ink hover:text-signal-blue"
                >
                  <span>阅读一页财经日报</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/topics"
                  className="flex items-center justify-between rounded-md bg-surface-muted/60 px-3 py-2.5 text-ink hover:text-signal-blue"
                >
                  <span>跟踪一个长期主题</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
            <section className="rounded-lg border border-line bg-surface p-5">
              <SectionTitle label="当前范围" title="阶段04边界" />
              <p className="text-sm leading-6 text-ink-muted">
                页面已经按未来 API 的数据形状组织，但本阶段只读取
                Seed。搜索、筛选和时间窗口是本地交互骨架，真实查询将在阶段05接入。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-md bg-signal-cyan/10 px-2 py-1 text-xs text-signal-cyan">
                  Seed 可浏览
                </span>
                <span className="rounded-md bg-surface-muted px-2 py-1 text-xs text-ink-muted">
                  无实时刷新
                </span>
              </div>
            </section>
          </aside>
        </div>

        <p className="mt-10 text-center text-xs leading-5 text-ink-muted">
          AI 分析仅用于辅助理解新闻，不构成投资建议。演示内容不代表真实市场事实。
        </p>
      </div>
    </AppShell>
  );
}
