import type { HTMLAttributes, ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from './utils';

type ScoreTone = 'low' | 'medium' | 'high';

function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

export function FinanceScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 font-data text-xs font-semibold tabular-nums',
        tone === 'high' && 'border-signal-blue/25 bg-signal-blue/10 text-signal-blue dark:text-blue-300',
        tone === 'medium' && 'border-signal-amber/25 bg-signal-amber/10 text-amber-700 dark:text-amber-300',
        tone === 'low' && 'border-line bg-surface-muted text-ink-muted',
        className,
      )}
      aria-label={`财经重要度 ${score} 分`}
    >
      <span className="font-body font-medium">财</span>
      {score}
    </span>
  );
}

export function HeatScoreBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 font-data text-xs font-semibold text-market-up tabular-nums dark:text-red-300',
        className,
      )}
      aria-label={`事件热度 ${score} 分`}
    >
      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
      {score}
    </span>
  );
}

export type MarketImpactValue = 'strong_positive' | 'positive' | 'neutral' | 'negative' | 'strong_negative' | 'uncertain';

const impactMap: Record<MarketImpactValue, { label: string; className: string; icon?: ReactNode }> = {
  strong_positive: { label: '强利好', className: 'text-market-up bg-red-500/10 border-red-500/20', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
  positive: { label: '偏利好', className: 'text-market-up bg-red-500/10 border-red-500/20', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
  neutral: { label: '中性', className: 'text-ink-muted bg-surface-muted border-line' },
  negative: { label: '偏利空', className: 'text-market-down bg-emerald-500/10 border-emerald-500/20', icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
  strong_negative: { label: '强利空', className: 'text-market-down bg-emerald-500/10 border-emerald-500/20', icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
  uncertain: { label: '影响待定', className: 'text-signal-amber bg-amber-500/10 border-amber-500/20' },
};

export function MarketImpact({ value, confidence }: { value: MarketImpactValue; confidence?: number }) {
  const item = impactMap[value];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium', item.className)}>
      {item.icon}
      {item.label}
      {confidence !== undefined && <span className="font-data opacity-70">{Math.round(confidence * 100)}%</span>}
    </span>
  );
}

export function SourceBadge({ name, level = 'B' }: { name: string; level?: 'A' | 'B' | 'C' | 'D' | 'E' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span className={cn('grid h-4 w-4 place-items-center rounded-sm font-data text-[9px] font-bold', level === 'A' ? 'bg-signal-blue text-white' : 'bg-surface-muted text-ink-muted')}>{level}</span>
      {name}
    </span>
  );
}

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs', active ? 'border-signal-blue bg-signal-blue text-white' : 'border-line bg-surface text-ink-muted')}>{children}</span>;
}

export function NewsCard({
  time,
  source,
  title,
  summary,
  score,
  impact,
  tags = [],
  relatedSources = 0,
  reason,
}: {
  time: string;
  source: string;
  title: string;
  summary: string;
  score: number;
  impact: MarketImpactValue;
  tags?: string[];
  relatedSources?: number;
  reason?: string;
}) {
  return (
    <article className="group border-b border-line bg-surface px-4 py-5 transition-colors hover:bg-surface-muted/45 sm:px-5">
      <div className="flex gap-4">
        <time className="w-11 shrink-0 pt-1 font-data text-xs text-ink-muted tabular-nums">{time}</time>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2"><SourceBadge name={source} /><FinanceScoreBadge score={score} /><MarketImpact value={impact} /></div>
          <h3 className="font-display text-lg font-semibold leading-7 text-ink transition-colors group-hover:text-signal-blue">{title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{summary}</p>
          {reason && <p className="mt-3 border-l-2 border-signal-amber pl-3 text-xs leading-5 text-ink-muted"><strong className="text-ink">为什么重要：</strong>{reason}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">{tags.map((item) => <Tag key={item}>{item}</Tag>)}{relatedSources > 0 && <span className="text-xs text-signal-blue">另有 {relatedSources} 家信源</span>}</div>
        </div>
      </div>
    </article>
  );
}

export function EventCard({ title, summary, heat, finance, status, sources, updatedAt }: { title: string; summary: string; heat: number; finance: number; status: 'confirmed' | 'developing' | 'rumor' | 'disputed' | 'retracted'; sources: number; updatedAt: string }) {
  const statusLabel = { confirmed: '已确认', developing: '持续发展', rumor: '未经确认', disputed: '存在争议', retracted: '已撤回' }[status];
  return (
    <article className="rounded-lg border border-line bg-surface p-5 shadow-raised">
      <div className="flex items-start justify-between gap-4"><span className="text-xs font-medium text-signal-cyan">事件 · {statusLabel}</span><div className="flex gap-2"><FinanceScoreBadge score={finance} /><HeatScoreBadge score={heat} /></div></div>
      <h3 className="mt-4 font-display text-xl font-semibold leading-8 text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{summary}</p>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted"><span>{sources} 家信源交叉报道</span><time>{updatedAt} 更新</time></div>
    </article>
  );
}

export function DateGroup({ date, label, count }: { date: string; label: string; count: number }) {
  return <div className="sticky top-16 z-10 flex items-center gap-3 border-y border-line bg-canvas/95 px-4 py-2.5 backdrop-blur-sm"><time className="font-data text-xs font-semibold text-ink">{date}</time><span className="text-xs text-ink-muted">{label}</span><span className="ml-auto font-data text-xs text-ink-muted">{count} 条</span></div>;
}

export function SearchBar({ placeholder = '搜索新闻、事件或主题', className }: { placeholder?: string; className?: string }) {
  return <label className={cn('flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-ink-muted focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/15', className)}><Search className="h-4 w-4" aria-hidden="true" /><span className="sr-only">搜索</span><input className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" placeholder={placeholder} /></label>;
}

export function FilterBar({ children }: { children?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3"><span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted"><SlidersHorizontal className="h-4 w-4" />筛选</span>{children ?? <><Tag active>全部</Tag><Tag>中国市场</Tag><Tag>宏观</Tag><Tag>公司</Tag><Tag>商品</Tag></>}</div>;
}

export function EmptyState({ title = '暂无符合条件的内容', description = '可以调整筛选条件，或稍后刷新。' }: { title?: string; description?: string }) {
  return <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-line bg-surface p-8 text-center"><div><Search className="mx-auto h-6 w-6 text-ink-muted" /><h3 className="mt-3 font-medium text-ink">{title}</h3><p className="mt-1 text-sm text-ink-muted">{description}</p></div></div>;
}

export function ErrorState({ title = '内容加载失败', description = '网络或服务暂时不可用，请重新加载。' }: { title?: string; description?: string }) {
  return <div className="grid min-h-48 place-items-center rounded-lg border border-red-500/20 bg-red-500/5 p-8 text-center"><div><AlertCircle className="mx-auto h-6 w-6 text-market-up" /><h3 className="mt-3 font-medium text-ink">{title}</h3><p className="mt-1 text-sm text-ink-muted">{description}</p><button className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-xs font-medium text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-blue"><RefreshCw className="h-3.5 w-3.5" />重新加载</button></div></div>;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none', className)} {...props} />;
}
