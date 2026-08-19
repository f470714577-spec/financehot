export type TimeRange = 'all' | '24h' | '7d';

export type NewsQueryInput = {
  q?: string;
  category?: string;
  market?: string;
  source?: string;
  minScore?: string;
  from?: string;
  timeRange?: TimeRange;
};

export type NewsQueryState = {
  timeRange: TimeRange;
  from?: string;
};

export type NewsQueryFilters = Omit<NewsQueryInput, 'from' | 'timeRange'> & {
  cursor?: string;
};

const rangeMilliseconds: Record<Exclude<TimeRange, 'all'>, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
};

export function initialTimeRange(query: NewsQueryInput, now: number): TimeRange {
  if (query.timeRange === '24h' || query.timeRange === '7d') return query.timeRange;
  if (!query.from) return 'all';
  const age = now - Date.parse(query.from);
  if (age >= 0 && age <= 36 * 60 * 60 * 1000) return '24h';
  if (age >= 0 && age <= 8 * 86_400_000) return '7d';
  return 'all';
}

export function timeAnchor(timeRange: Exclude<TimeRange, 'all'>, now: number): string {
  return new Date(now - rangeMilliseconds[timeRange]).toISOString();
}

export function initialNewsQueryState(query: NewsQueryInput, now: number): NewsQueryState {
  const timeRange = initialTimeRange(query, now);
  return {
    timeRange,
    from: query.from ?? (timeRange === 'all' ? undefined : timeAnchor(timeRange, now)),
  };
}

export function changeTimeRange(state: NewsQueryState, timeRange: TimeRange, now: number): NewsQueryState {
  return timeRange === 'all'
    ? { timeRange }
    : { timeRange, from: timeAnchor(timeRange, now) };
}

export function buildNewsParams(state: NewsQueryState, filters: NewsQueryFilters, _now?: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.market && filters.market !== 'all') params.set('market', filters.market);
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  if (filters.minScore && filters.minScore !== 'all') params.set('minScore', filters.minScore);
  if (state.from) params.set('from', state.from);
  if (filters.cursor) params.set('cursor', filters.cursor);
  return params;
}
