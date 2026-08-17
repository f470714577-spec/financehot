'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { DateGroup, EmptyState, FilterBar, NewsCard, Tag } from '@financehot/ui';
import type { NewsItem } from '@financehot/shared';
import {
  buildNewsParams,
  changeTimeRange,
  initialNewsQueryState,
  type TimeRange,
} from '@/lib/news-query';

const categoryOptions = [
  { value: 'all', label: '全部' },
  { value: 'macro', label: '宏观' },
  { value: 'monetary-policy', label: '政策' },
  { value: 'markets', label: '市场' },
  { value: 'corporate', label: '公司' },
  { value: 'tech', label: '科技' },
  { value: 'energy', label: '能源' },
  { value: 'commodities', label: '商品' },
  { value: 'trade', label: '贸易' },
] as const;

const marketOptions = [
  { value: 'all', label: '全部市场' },
  { value: 'china', label: '中国市场' },
  { value: 'us', label: '美国市场' },
  { value: 'europe', label: '欧洲市场' },
  { value: 'japan', label: '日本市场' },
  { value: 'global', label: '全球' },
] as const;

const timeOptions = [
  { value: 'all', label: '全部时间' },
  { value: '24h', label: '过去24小时' },
  { value: '7d', label: '过去7天' },
] as const;

function dateKey(item: NewsItem): string {
  return item.publishedAt?.slice(0, 10) ?? '未标注日期';
}

function dateLabel(key: string): string {
  if (key === '未标注日期') return key;
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${key}T00:00:00Z`));
}

function timeLabel(item: NewsItem): string {
  return item.publishedAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.publishedAt)) : '--:--';
}

function impactFromScore(value: number | null) {
  if (value === null) return 'uncertain' as const;
  if (value >= 80) return 'strong_positive' as const;
  if (value >= 65) return 'positive' as const;
  if (value >= 45) return 'neutral' as const;
  if (value >= 25) return 'negative' as const;
  return 'strong_negative' as const;
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
      <span className="shrink-0">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 bg-transparent font-medium text-ink outline-none">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function NewsFeed({
  items: initialItems,
  nextCursor: initialNextCursor = null,
  hasMore: initialHasMore = false,
  compact = false,
  showFilters = false,
  showCategoryTabs = false,
  initialQuery = {},
}: {
  items: NewsItem[];
  nextCursor?: string | null;
  hasMore?: boolean;
  compact?: boolean;
  showFilters?: boolean;
  showCategoryTabs?: boolean;
  initialQuery?: Record<string, string | undefined>;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [query, setQuery] = useState(initialQuery.q ?? '');
  const [category, setCategory] = useState(initialQuery.category ?? 'all');
  const [timeRangeState, setTimeRangeState] = useState(() => initialNewsQueryState(initialQuery, Date.now()));
  const { timeRange } = timeRangeState;
  const [market, setMarket] = useState(initialQuery.market ?? 'all');
  const [source, setSource] = useState(initialQuery.source ?? 'all');
  const [score, setScore] = useState(initialQuery.minScore ?? 'all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const firstEffect = useRef(true);

  const sourceOptions = useMemo(() => [
    { value: 'all', label: '全部来源' },
    ...[...new Map(initialItems.map((item) => [item.source.id, item.source.name])).entries()].map(([value, label]) => ({ value, label })),
  ], [initialItems]);

  useEffect(() => {
    if (!showFilters || firstEffect.current) {
      firstEffect.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const params = buildNewsParams(timeRangeState, { q: query, category, market, source, minScore: score });
      const endpoint = query.trim() ? '/api/search' : '/api/news';
      window.history.replaceState(null, '', `/news?${params.toString()}`);
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(`${endpoint}?${params.toString()}`, { cache: 'no-store' });
        const body = await response.json() as { success: boolean; data?: { items: NewsItem[]; nextCursor: string | null; hasMore: boolean } };
        if (!response.ok || !body.success || !body.data) throw new Error('request failed');
        setItems(body.data.items);
        setNextCursor(body.data.nextCursor);
        setHasMore(body.data.hasMore);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [category, market, query, score, showFilters, source, timeRangeState]);

  async function loadMore() {
    if (!nextCursor || loading) return;
    const params = buildNewsParams(timeRangeState, { q: query, category, market, source, minScore: score, cursor: nextCursor });
    setLoading(true);
    try {
      const response = await fetch(`${query.trim() ? '/api/search' : '/api/news'}?${params.toString()}`, { cache: 'no-store' });
      const body = await response.json() as { success: boolean; data?: { items: NewsItem[]; nextCursor: string | null; hasMore: boolean } };
      if (!response.ok || !body.success || !body.data) throw new Error('request failed');
      setItems((current) => [...current, ...body.data!.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(body.data.nextCursor);
      setHasMore(body.data.hasMore);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleTimeRangeChange(value: string) {
    if (value !== 'all' && value !== '24h' && value !== '7d') return;
    setTimeRangeState((current) => changeTimeRange(current, value as TimeRange, Date.now()));
  }

  const groupedItems = useMemo(() => {
    const groups = new Map<string, NewsItem[]>();
    items.forEach((item) => groups.set(dateKey(item), [...(groups.get(dateKey(item)) ?? []), item]));
    return [...groups.entries()];
  }, [items]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      {showFilters && <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-ink-muted focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/15">
          <Search className="h-4 w-4" aria-hidden="true" /><span className="sr-only">搜索新闻、事件或主题</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" placeholder="搜索新闻、事件或主题" />
        </label>
        <div className="flex flex-wrap gap-2">
          <SelectControl label="时间" value={timeRange} options={timeOptions} onChange={handleTimeRangeChange} />
          <SelectControl label="市场" value={market} options={marketOptions} onChange={setMarket} />
          <SelectControl label="来源" value={source} options={sourceOptions} onChange={setSource} />
          <SelectControl label="评分" value={score} options={[{ value: 'all', label: '不限' }, { value: '80', label: '≥80' }, { value: '90', label: '≥90' }]} onChange={setScore} />
        </div>
      </div>}
      {(showFilters || showCategoryTabs) && <FilterBar>
        {categoryOptions.map((option) => <button type="button" key={option.value} onClick={() => setCategory(option.value)}><Tag active={category === option.value}>{option.label}</Tag></button>)}
      </FilterBar>}
      {error ? <div className="p-4"><EmptyState title="动态加载失败" description="请稍后重试，数据库查询未返回可用结果。" /></div> : items.length === 0 ? <div className="p-4"><EmptyState title="没有匹配的动态" description="可以放宽时间、市场、分类或评分条件后再试。" /></div> : groupedItems.map(([key, group]) => (
        <div key={key}>
          <DateGroup date={dateLabel(key)} label={key === new Date().toISOString().slice(0, 10) ? '今天' : '时间流'} count={group.length} />
          {group.slice(0, compact ? 5 : undefined).map((item) => <Link key={item.id} href={`/news/${item.id}`} className="block"><NewsCard time={timeLabel(item)} source={item.source.name} title={item.title} summary={item.summary} score={item.score} impact={impactFromScore(item.marketImpactScore)} tags={item.tags} relatedSources={item.relatedSources} reason={item.reason ?? undefined} /></Link>)}
        </div>
      ))}
      {(hasMore || loading) && <div className="border-t border-line px-4 py-3 text-center"><button type="button" disabled={loading} onClick={loadMore} className="rounded-md border border-line px-4 py-2 text-xs font-medium text-ink-muted hover:bg-surface-muted disabled:opacity-50">{loading ? '加载中…' : '加载更多'}</button></div>}
      {!hasMore && !loading && <div className="border-t border-line px-4 py-3 text-xs text-ink-muted">已展示 {items.length} 条数据库动态</div>}
    </div>
  );
}
