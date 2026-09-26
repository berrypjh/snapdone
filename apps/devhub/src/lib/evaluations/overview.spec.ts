import { afterEach, describe, expect, it } from 'vitest';

import { removeResults, resultsRepository } from '../../test-support/evaluation-results';

import { filterOptions, parseFilter, runRows, trendOverview } from './overview';

/** Go golden 세 run(분류 partial · 텍스트 completed · 번역 partial)과 그 복사본으로 개요 규칙을 본다. */

afterEach(removeResults);

const unavailable = {
  availability: 'unavailable',
  value: null,
  reason: 'no predicted case with a non-empty reference',
};

/** text-golden을 시작 시각만 다르게 복사한다. 같은 비교 묶음이 된다. */
const textSeries = () => {
  const r = resultsRepository();
  r.copyRun('text-golden', 'text-b');
  r.edit('text-b/metadata.json', (m) => (m.startedAt = '2026-09-23T06:00:00Z'));
  r.copyRun('text-golden', 'text-c');
  r.edit('text-c/metadata.json', (m) => (m.startedAt = '2026-09-24T06:00:00Z'));
  return r;
};

type TextQualityJson = { text: { corpusCer: unknown } };
const quality = (summary: Record<string, unknown>) =>
  (summary.variants as { quality: TextQualityJson[] }[])[0].quality[0];

describe('run rows', () => {
  it('shows every task with its own headline metric and state', () => {
    const rows = runRows(resultsRepository().repo.listRuns());

    expect(rows.map((r) => [r.id, r.taskLabel, r.state])).toEqual([
      ['replay-golden', '사진 분류', 'partial'],
      ['text-golden', '텍스트 추출', 'completed'],
      ['translation-golden', '번역', 'partial'],
    ]);
    expect(rows.map((r) => r.variants[0].metric?.label)).toEqual([
      'category 정확도',
      'corpus CER',
      '보존 구간 재현율',
    ]);
    // 번역의 기본 규칙은 채점하지 않으므로 pass rate가 아니다.
    expect(rows[2].variants[0].metric?.display.text).not.toContain('해당 없음');
    expect(rows[0].execution).toEqual({
      completed: 2,
      failed: 0,
      timedOut: 0,
      notRun: 1,
      unsupported: 0,
    });
    expect(rows[0].href).toBe('/evals/runs/replay-golden');
  });

  it('shows an unavailable headline as missing with its reason, never as zero', () => {
    const r = resultsRepository();
    r.edit('text-golden/summary.json', (s) => (quality(s).text.corpusCer = unavailable));
    const [, text] = runRows(r.repo.listRuns());

    expect(text.variants[0].metric?.display).toEqual({
      text: '값 없음',
      missing: true,
      availability: 'unavailable',
      reason: unavailable.reason,
    });
  });

  it('keeps an unreadable run as a row with its error', () => {
    const r = resultsRepository();
    r.edit('text-golden/metadata.json', (m) => (m.schemaVersion = 9));
    const text = runRows(r.repo.listRuns()).find((row) => row.id === 'text-golden');

    expect(text).toMatchObject({
      state: 'unreadable',
      taskLabel: '알 수 없음',
      execution: null,
      error: { kind: '모르는 schema 버전' },
    });
  });
});

describe('trend', () => {
  it('joins completed runs of one comparable group in start order', () => {
    const { repo } = textSeries();
    const trend = trendOverview(repo.listRuns());

    expect(trend.series).toHaveLength(1);
    const [series] = trend.series;
    expect(series).toMatchObject({
      task: 'text-extraction',
      variantId: 'tv',
      metric: { label: 'corpus CER', direction: 'lower-is-better' },
    });
    expect(series.points.map((p) => p.runId)).toEqual(['text-golden', 'text-b', 'text-c']);
    expect(series.points.every((p) => p.value !== null)).toBe(true);
    // 분류 · 번역 golden은 partial이라 추세에서 빠진다.
    expect(trend.excludedPartial).toBe(2);
  });

  it('counts a retried run once — the retry replaces its original in the trend', () => {
    const r = textSeries();
    // text-c는 text-b에서 실패한 것만 다시 부른 run이다. text-b의 성공 결과가 text-c에 옮겨져 있다.
    r.edit('text-c/metadata.json', (m) => (m.retriedFrom = 'text-b'));
    const entries = r.repo.listRuns();
    const trend = trendOverview(entries);

    expect(trend.series[0].points.map((p) => p.runId)).toEqual(['text-golden', 'text-c']);
    expect(trend.excludedRetried).toBe(1);
    const retry = runRows(entries, trend).find((row) => row.id === 'text-c');
    expect(retry?.variants[0].previousRunId).toBe('text-golden');
  });

  it('breaks the line at an unavailable value instead of plotting zero', () => {
    const r = textSeries();
    r.edit('text-b/summary.json', (s) => (quality(s).text.corpusCer = unavailable));
    const [series] = trendOverview(r.repo.listRuns()).series;

    expect(series.points.map((p) => p.value === null)).toEqual([false, true, false]);
    expect(series.points[1].display.text).toBe('값 없음');
  });

  it('does not join runs that selected different cases, a different dataset version, or a partial run', () => {
    const r = resultsRepository();
    r.copyRun('text-golden', 'other-selection');
    r.edit('other-selection/metadata.json', (m) => {
      (m.dataset as Record<string, unknown>).selectionHash = 'f'.repeat(64);
      m.startedAt = '2026-09-23T06:00:00Z';
    });
    r.copyRun('text-golden', 'other-version');
    r.edit(
      'other-version/metadata.json',
      (m) => ((m.dataset as Record<string, unknown>).version = 2),
    );
    r.copyRun('replay-golden', 'classification-again');

    const trend = trendOverview(r.repo.listRuns());
    expect(trend.series).toEqual([]);
    expect(trend.excludedPartial).toBe(3);
  });

  it('links each row to the previous comparable run', () => {
    const rows = runRows(textSeries().repo.listRuns());
    const previous = Object.fromEntries(
      rows.map((r) => [r.id, r.variants[0]?.previousRunId ?? null]),
    );

    expect(previous).toMatchObject({
      'text-c': 'text-b',
      'text-b': 'text-golden',
      'text-golden': null,
      'replay-golden': null,
    });
  });
});

describe('filters', () => {
  it('accepts only known tasks and existing datasets', () => {
    const rows = runRows(resultsRepository().repo.listRuns());

    expect(parseFilter(rows, 'translation', 'nope')).toEqual({
      task: 'translation',
      dataset: null,
    });
    expect(parseFilter(rows, ['x'], 'ocr-fixture v1')).toEqual({
      task: null,
      dataset: 'ocr-fixture v1',
    });
    expect(filterOptions(rows).tasks).toEqual([
      'image-classification',
      'text-extraction',
      'translation',
    ]);
  });
});
