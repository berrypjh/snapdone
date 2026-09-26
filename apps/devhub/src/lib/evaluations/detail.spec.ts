import { afterEach, describe, expect, it } from 'vitest';

import { removeResults, resultsRepository } from '../../test-support/evaluation-results';

import {
  attemptedDurations,
  caseFilterCounts,
  caseMetric,
  confusionMatrix,
  executionSegments,
  failureCounts,
  histogram,
  INVALID_LABEL,
  labelRows,
  parseCaseFilter,
  spread,
} from './detail';

afterEach(removeResults);

const run = (id: string) => resultsRepository().repo.getRun(id);

describe('execution and failures', () => {
  it('splits invocations into segments that add up, counting missing lines as not-run', () => {
    const { summary } = run('replay-golden');
    const { total, segments } = executionSegments(summary.variants[0]);

    expect(total).toBe(3);
    expect(Object.fromEntries(segments.map((s) => [s.key, s.count]))).toEqual({
      completed: 2,
      failed: 0,
      timedOut: 0,
      notRun: 1,
      unsupported: 0,
    });
    expect(segments.reduce((sum, s) => sum + s.count, 0)).toBe(total);
  });

  it('orders failure counts by size and drops zeros', () => {
    expect(failureCounts({ timeout: 1, provider: 3, other: 0 })).toEqual([
      ['provider', 3],
      ['timeout', 1],
    ]);
  });
});

describe('latency and tokens', () => {
  it('has no samples for replay, so there is no histogram', () => {
    const r = run('text-golden');
    expect(attemptedDurations(r.cases, 'tv')).toEqual([]);
    expect(histogram([])).toBeNull();
  });

  it('bins measured durations from zero with a nice width and keeps every sample', () => {
    const bins = histogram([120, 130, 480, 900, 1510]);

    expect(bins?.[0]).toEqual({ from: 0, to: 200, count: 2 });
    expect(bins?.reduce((sum, b) => sum + b.count, 0)).toBe(5);
    expect(spread([3, 1, 2, 10])).toEqual({ n: 4, min: 1, median: 2.5, max: 10 });
    expect(spread([])).toBeNull();
  });
});

describe('classification', () => {
  it('lays out the Go confusion with the invalid bucket last', () => {
    const q = run('replay-golden').summary.variants[0].quality[0];
    if (q.task !== 'image-classification') throw new Error('not classification');
    const matrix = confusionMatrix(q.quality);

    expect(matrix.rows).toEqual(['event']);
    expect(matrix.columns).toEqual(['event', 'place', INVALID_LABEL]);
    expect(matrix.cells).toEqual([[1, 1, 1]]);
    expect(matrix.rowTotals).toEqual([3]);
    expect(labelRows(q.quality)[0]).toMatchObject({ label: 'event', support: 3, tp: 1, fn: 2 });
  });
});

describe('cases', () => {
  it('orders a case metric and keeps missing values with their reasons', () => {
    const { cases } = run('translation-golden');
    const spans = caseMetric(cases, 'tv', 'critical-span-recall', 'asc');

    expect(spans.measured).toEqual([{ caseId: 'tr-1', value: 0.5 }]);
    expect(spans.missing.map((m) => [m.caseId, m.availability])).toEqual([
      ['tr-2', 'not-applicable'],
      ['tr-3', 'unavailable'],
    ]);
  });

  it('filters cases by Go execution status and quality outcome', () => {
    expect(caseFilterCounts(run('translation-golden').cases)).toEqual({
      all: 3,
      'quality-failed': 0,
      errors: 0,
      'timed-out': 0,
      'not-run': 1,
    });
    expect(caseFilterCounts(run('text-golden').cases)['quality-failed']).toBe(3);
    expect(parseCaseFilter('not-run')).toBe('not-run');
    expect(parseCaseFilter('../x')).toBe('all');
    expect(parseCaseFilter(['errors'])).toBe('all');
  });
});
