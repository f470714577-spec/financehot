import type { Metadata } from 'next';
import { EmptyState, ErrorState } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';
import { DemoNotice, PageHeader } from '@/components/page-header';
import { NewStoriesNotice, NewsFeed } from '@/components/demo-controls';
import { demoNewsView } from '@/lib/demo-data';

export const metadata: Metadata = {
  title: '全部动态｜FinanceHot',
  description: '按时间、市场、分类、来源和 Finance Score 浏览全球财经动态。',
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 sm:px-6 lg:pb-12">
        <PageHeader
          eyebrow="ALL NEWS · SEED VIEW"
          title="全部动态"
          description="按时间倒序查看已通过财经相关性筛选的演示新闻。筛选控件的接口与未来查询 API 保持一致。"
        />
        <DemoNotice />
        <NewStoriesNotice count={5} />
        {state === 'empty' ? (
          <EmptyState
            title="当前筛选没有结果"
            description="调整时间、市场、分类或评分条件后再试。"
          />
        ) : state === 'error' ? (
          <ErrorState
            title="演示查询失败"
            description="这是阶段04的错误边界预览，阶段05将接入真实 API 错误处理。"
          />
        ) : (
          <NewsFeed items={demoNewsView} showFilters showCategoryTabs />
        )}
      </div>
    </AppShell>
  );
}
