import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildNewsParams,
  changeTimeRange,
  initialNewsQueryState,
  timeAnchor,
} from '../lib/news-query';

const firstNow = Date.parse('2026-08-17T12:00:00.000Z');
const laterNow = firstNow + 17_321;
const rawFrom = '2026-08-16T20:00:00.004+08:00';

test('URL 初始化逐字复用原始 from', () => {
  const state = initialNewsQueryState({ from: rawFrom, timeRange: '7d' }, firstNow);
  const params = buildNewsParams(state, {}, laterNow);

  assert.equal(state.from, rawFrom);
  assert.equal(params.get('from'), rawFrom);

  const olderUrlState = initialNewsQueryState({ from: rawFrom }, firstNow + 9 * 86_400_000);
  assert.equal(olderUrlState.timeRange, 'all');
  assert.equal(buildNewsParams(olderUrlState, {}, laterNow).get('from'), rawFrom);
});

test('时间前进后，首次请求与 loadMore 仍复用同一 from', () => {
  const state = initialNewsQueryState({ timeRange: '7d' }, firstNow);
  const first = buildNewsParams(state, {}, firstNow);
  const loadMore = buildNewsParams(state, { cursor: 'cursor-1' }, laterNow);

  assert.equal(loadMore.get('from'), first.get('from'));
});

test('修改其他筛选不改变冻结的 from', () => {
  const state = initialNewsQueryState({ from: rawFrom, timeRange: '7d' }, firstNow);
  const variants = [
    { q: '央行', category: 'macro', market: 'china', source: 'source-1', minScore: '80' },
    { q: '央行', category: 'markets', market: 'us', source: 'source-2', minScore: '90' },
  ];

  for (const filters of variants) {
    assert.equal(buildNewsParams(state, filters, laterNow).get('from'), rawFrom);
  }
});

test('主动切换 24h↔7d 只生成新锚点，切回全部时间移除 from', () => {
  const state24h = changeTimeRange({ timeRange: 'all' }, '24h', firstNow);
  const state7d = changeTimeRange(state24h, '7d', laterNow);
  const expected7d = timeAnchor('7d', laterNow);

  assert.equal(state24h.from, timeAnchor('24h', firstNow));
  assert.equal(state7d.from, expected7d);
  assert.equal(buildNewsParams(state7d, {}, laterNow + 99_999).get('from'), expected7d);

  const allTime = changeTimeRange(state7d, 'all', laterNow + 99_999);
  assert.equal(allTime.from, undefined);
  assert.equal(buildNewsParams(allTime, {}, laterNow + 99_999).has('from'), false);
});
