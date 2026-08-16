'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { DateGroup, EmptyState, FilterBar, NewsCard, Tag } from '@financehot/ui';
import type { DemoNewsView } from '@/lib/demo-data';

const timeOptions = [
  { value: 'all', label: '全部时间' },
  { value: '24h', label: '过去24小时' },
  { value: '7d', label: '过去7天' },
] as const;

const categoryOptions = [
  { value: 'all', label: '全部分类' },
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
  { value: '中国市场', label: '中国市场' },
  { value: '美国市场', label: '美国市场' },
  { value: '欧洲市场', label: '欧洲市场' },
  { value: '日本市场', label: '日本市场' },
  { value: '全球', label: '全球' },
] as const;

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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 bg-transparent font-medium text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewStoriesNotice({ count = 3 }: { count?: number }) {
  const [visible, setVisible] = useState(true);
  const [inserted, setInserted] = useState(false);

  if (!visible) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-signal-blue/25 bg-signal-blue/10 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-ink">
        <Sparkles className="h-4 w-4 text-signal-blue" />
        <span>{inserted ? '新动态已插入时间流（演示交互）' : `发现 ${count} 条新动态`}</span>
      </div>
      <div className="flex items-center gap-2">
        {!inserted && (
          <button
            type="button"
            onClick={() => setInserted(true)}
            className="rounded-md bg-signal-blue px-3 py-1.5 text-xs font-medium text-white"
          >
            查看新动态
          </button>
        )}
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-md px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-muted"
        >
          稍后
        </button>
      </div>
    </div>
  );
}

export function NewsFeed({
  items,
  compact = false,
  showFilters = false,
  showCategoryTabs = false,
}: {
  items: DemoNewsView[];
  compact?: boolean;
  showFilters?: boolean;
  showCategoryTabs?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [timeRange, setTimeRange] = useState('all');
  const [market, setMarket] = useState('all');
  const [source, setSource] = useState('all');
  const [score, setScore] = useState('all');

  const sourceOptions = useMemo(
    () => [
      { value: 'all', label: '全部来源' },
      ...[...new Set(items.map((item) => item.source))].map((item) => ({
        value: item,
        label: item.replace('（Demo）', ''),
      })),
    ],
    [items],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        [item.title, item.summary, item.source, ...item.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory = category === 'all' || item.categorySlug === category;
      const matchesTime =
        timeRange === 'all' || (timeRange === '24h' ? item.dateKey === '2026-08-16' : true);
      const matchesMarket = market === 'all' || item.market === market;
      const matchesSource = source === 'all' || item.source === source;
      const matchesScore = score === 'all' || item.score >= Number(score);
      return (
        matchesQuery &&
        matchesCategory &&
        matchesTime &&
        matchesMarket &&
        matchesSource &&
        matchesScore
      );
    });
  }, [category, items, market, query, score, source, timeRange]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { label: string; items: DemoNewsView[] }>();
    filteredItems.forEach((item) => {
      const current = groups.get(item.dateKey) ?? { label: item.dateLabel, items: [] };
      current.items.push(item);
      groups.set(item.dateKey, current);
    });
    return [...groups.entries()];
  }, [filteredItems]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-ink-muted focus-within:border-signal-blue focus-within:ring-2 focus-within:ring-signal-blue/15">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">搜索新闻、事件或主题</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            placeholder="搜索新闻、事件或主题"
          />
        </label>
        {showFilters && (
          <div className="flex flex-wrap gap-2">
            <SelectControl
              label="时间"
              value={timeRange}
              options={timeOptions}
              onChange={setTimeRange}
            />
            <SelectControl
              label="市场"
              value={market}
              options={marketOptions}
              onChange={setMarket}
            />
            <SelectControl
              label="来源"
              value={source}
              options={sourceOptions}
              onChange={setSource}
            />
            <SelectControl
              label="评分"
              value={score}
              options={[
                { value: 'all', label: '不限' },
                { value: '80', label: '≥80' },
                { value: '90', label: '≥90' },
              ]}
              onChange={setScore}
            />
          </div>
        )}
      </div>
      {(showFilters || showCategoryTabs) && (
        <FilterBar>
          <button type="button" onClick={() => setCategory('all')}>
            <Tag active={category === 'all'}>全部</Tag>
          </button>
          {categoryOptions.slice(1).map((option) => (
            <button type="button" key={option.value} onClick={() => setCategory(option.value)}>
              <Tag active={category === option.value}>{option.label}</Tag>
            </button>
          ))}
        </FilterBar>
      )}
      {filteredItems.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="没有匹配的动态"
            description="可以放宽时间、市场、分类或评分条件后再试。"
          />
        </div>
      ) : (
        groupedItems.map(([dateKey, group]) => (
          <div key={dateKey}>
            <DateGroup
              date={group.label}
              label={dateKey === '2026-08-16' ? '今天' : '更早'}
              count={group.items.length}
            />
            {group.items.slice(0, compact ? 5 : undefined).map((item) => (
              <Link key={item.id} href={`/news/${item.id}`} className="block">
                <NewsCard
                  time={item.time}
                  source={item.source}
                  title={item.title}
                  summary={item.summary}
                  score={item.score}
                  impact={item.impact}
                  tags={item.tags}
                  relatedSources={item.relatedSources}
                  reason={item.reason}
                />
              </Link>
            ))}
          </div>
        ))
      )}
      <div className="border-t border-line px-4 py-3 text-xs text-ink-muted">
        已展示 {Math.min(filteredItems.length, compact ? 5 : filteredItems.length)} /{' '}
        {filteredItems.length} 条演示动态
      </div>
    </div>
  );
}
