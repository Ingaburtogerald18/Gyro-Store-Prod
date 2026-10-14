import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeOverview, summarizeSearches, summarizeZeroResults, type RawEvent } from '../server/modules/analytics/aggregates';

function event(type: RawEvent['type'], session = 'visitor', payload: RawEvent['payload'] = null): RawEvent {
  return { type, session_id: session, payload, created_at: '2026-10-05T12:00:00Z' };
}

test('cuenta eventos y deduplica sesiones por paso del embudo', () => {
  const summary = summarizeOverview([
    event('page_view'), event('page_view'), event('page_view', 'other'),
    event('product_view'), event('product_view'), event('order_created'),
  ]);
  assert.equal(summary.visitors, 2);
  assert.equal(summary.pageViews, 3);
  assert.equal(summary.productViews, 2);
  assert.equal(summary.orders, 1);
  assert.equal(summary.viewToOrderRate, 0.5);
  assert.equal(summary.funnel[2]?.sessions, 1);
  assert.equal(summarizeOverview([]).viewToOrderRate, 0);
});

test('agrega búsquedas con sus conteos y promedios', () => {
  const rows = summarizeSearches([
    event('search', 'a', { queryNormalized: 'kz', resultsCount: 2 }),
    event('search', 'b', { queryNormalized: 'kz', resultsCount: 0, zeroResults: true }),
    event('search', 'c', { queryNormalized: 'cable', resultsCount: 0 }),
    event('search', 'd', { queryNormalized: ' ' }),
    event('page_view'),
  ]);
  assert.deepEqual(rows, [
    { query: 'kz', count: 2, zeroResultCount: 1, avgResults: 1 },
    { query: 'cable', count: 1, zeroResultCount: 1, avgResults: 0 },
  ]);
  assert.deepEqual(summarizeZeroResults(rows).map(row => row.query), ['cable']);
});

test('las búsquedas fallidas no quedan excluidas por el límite del top general', () => {
  const events = Array.from({ length: 1001 }, (_, index) =>
    event('search', 'visitor', { queryNormalized: `available-${index}`, resultsCount: 5 }),
  );
  events.push(event('search', 'visitor', { queryNormalized: 'missing', resultsCount: 0 }));
  const rows = summarizeSearches(events);
  assert.equal(rows.length, 1002);
  assert.equal(summarizeZeroResults(rows, 1)[0]?.query, 'missing');
});
