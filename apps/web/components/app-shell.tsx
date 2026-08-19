'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpenText,
  CalendarDays,
  Flame,
  Globe2,
  Home,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Tags,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { label: '今日精选', href: '/', icon: Home },
  { label: '全部动态', href: '/news', icon: Globe2 },
  { label: '热点榜', href: '/hot', icon: Flame },
  { label: '财经日报', href: '/daily', icon: BookOpenText },
  { label: '主题追踪', href: '/topics', icon: Tags },
];

const marketSessions = [
  { city: '上海', time: '10:42', state: '交易中', tone: 'up' },
  { city: '东京', time: '11:42', state: '交易中', tone: 'up' },
  { city: '伦敦', time: '03:42', state: '未开盘', tone: 'idle' },
  { city: '纽约', time: '22:42', state: '已收盘', tone: 'down' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem('financehot-theme');
    const nextDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('financehot-theme', next ? 'dark' : 'light');
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-line bg-surface transition-transform duration-200 lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center border-b border-line px-5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-ink font-data text-xs font-bold text-canvas">FH</div>
          <div className="ml-3"><div className="font-display text-sm font-bold tracking-wide">FinanceHot</div><div className="text-[10px] tracking-[0.16em] text-ink-muted">全球财经情报</div></div>
          <button className="ml-auto rounded-md p-2 text-ink-muted lg:hidden" onClick={() => setMenuOpen(false)} aria-label="关闭导航"><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="主导航">
          {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} onClick={() => setMenuOpen(false)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors', isActive(href) ? 'bg-signal-blue text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink')}><Icon className="h-4 w-4" />{label}</Link>)}
          <div className="px-3 pb-2 pt-6 text-[10px] font-semibold tracking-[0.16em] text-ink-muted">工作区</div>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"><CalendarDays className="h-4 w-4" />历史日期</button>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"><Settings className="h-4 w-4" />偏好设置</button>
        </nav>
        <div className="border-t border-line p-4 text-xs leading-5 text-ink-muted">AI 分析仅用于辅助理解新闻，不构成投资建议。</div>
      </aside>

      {menuOpen && <button className="fixed inset-0 z-40 bg-black/35 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="关闭导航遮罩" />}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm sm:px-6">
          <button className="rounded-md p-2 text-ink-muted hover:bg-surface-muted lg:hidden" onClick={() => setMenuOpen(true)} aria-label="打开导航"><Menu className="h-5 w-5" /></button>
           <Link href="/news" className="hidden h-9 min-w-64 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-left text-sm text-ink-muted sm:flex"><Search className="h-4 w-4" />搜索全球财经情报<span className="ml-auto font-data text-[10px]">⌘ K</span></Link>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-2 text-xs text-ink-muted md:flex"><span className="h-1.5 w-1.5 rounded-full bg-market-down" />系统运行正常</span>
            <button className="rounded-md p-2 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="通知"><Bell className="h-4 w-4" /></button>
            <button className="rounded-md p-2 text-ink-muted hover:bg-surface-muted hover:text-ink" onClick={toggleTheme} aria-label={dark ? '切换浅色模式' : '切换深色模式'}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </header>

        <section className="border-b border-line bg-surface" aria-label="全球市场时钟">
          <div className="scrollbar-hide mx-auto flex max-w-[1180px] items-stretch overflow-x-auto px-4 sm:px-6">
            <div className="flex shrink-0 items-center border-r border-line py-3 pr-5"><span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-signal-cyan motion-reduce:animate-none" /><span className="text-xs font-semibold">全球市场脉冲</span></div>
            {marketSessions.map((market) => <div key={market.city} className="flex min-w-32 items-center justify-between border-r border-line px-4 py-2.5"><div><div className="text-[10px] text-ink-muted">{market.city}</div><div className="font-data text-sm font-semibold tabular-nums">{market.time}</div></div><span className={cn('text-[10px]', market.tone === 'up' ? 'text-market-up' : market.tone === 'down' ? 'text-market-down' : 'text-ink-muted')}>{market.state}</span></div>)}
          </div>
        </section>

        <main>{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-line bg-surface lg:hidden" aria-label="移动端导航">
           {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className={cn('flex flex-col items-center justify-center gap-1 text-[10px]', isActive(href) ? 'text-signal-blue' : 'text-ink-muted')}><Icon className="h-4 w-4" />{label.replace('今日', '').replace('全部', '')}</Link>)}
        </nav>
      </div>
    </div>
  );
}
