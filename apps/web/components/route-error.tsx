'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';

export function RouteError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 text-center text-ink">
      <div className="max-w-md rounded-lg border border-red-500/20 bg-surface p-8 shadow-raised">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-red-500/10 text-market-up">
          !
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold">页面暂时无法打开</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          页面遇到临时错误。可以重试，或返回首页继续浏览演示内容。
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-xs font-medium text-canvas"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
          <Link
            href="/"
            className="rounded-md border border-line px-4 py-2 text-xs font-medium text-ink"
          >
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
