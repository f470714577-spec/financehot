import Link from 'next/link';
import { EmptyState } from '@financehot/ui';
import { AppShell } from '@/components/app-shell';

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[720px] px-4 pb-24 pt-20 sm:px-6">
        <EmptyState
          title="没有找到这条演示内容"
          description="链接可能已失效，或该内容尚未进入当前 Seed 数据集。"
        />
        <div className="mt-5 text-center">
          <Link href="/" className="text-sm font-medium text-signal-blue">
            返回今日精选
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
