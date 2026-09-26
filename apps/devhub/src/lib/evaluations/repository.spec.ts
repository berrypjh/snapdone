import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  COMPARISON_ID,
  GOLDEN_RUNS,
  removeResults,
  resultsRepository,
} from '../../test-support/evaluation-results';

import { formatMeasure, primaryMetric } from './presentation';
import {
  EvaluationArtifactError,
  type EvaluationErrorKind,
  evaluationRepository,
  localEvaluations,
} from './repository';

// route 입구가 요청 시점까지 기다리는지 본다. 실제 Next 요청 범위는 테스트에 없다.
const connection = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('next/server', () => ({ connection }));

afterEach(removeResults);
const repository = resultsRepository;

const failure = (read: () => unknown): EvaluationArtifactError => {
  try {
    read();
  } catch (error) {
    if (error instanceof EvaluationArtifactError) return error;
    throw error;
  }
  throw new Error('expected an EvaluationArtifactError');
};

const expectFailure = (read: () => unknown, kind: EvaluationErrorKind, message?: string) => {
  const error = failure(read);
  expect(error.kind).toBe(kind);
  if (message) expect(error.message).toContain(message);
};

describe('evaluation repository — valid Go artifacts', () => {
  it.each([
    ['image-classification', GOLDEN_RUNS.classification],
    ['text-extraction', GOLDEN_RUNS.text],
    ['translation', GOLDEN_RUNS.translation],
  ] as const)('reads a %s run with its cases and summary', (task, id) => {
    const run = repository().repo.getRun(id);

    expect(run.metadata.task).toBe(task);
    expect(run.cases.map((c) => c.caseId)).toEqual(run.metadata.selectedCaseIds);
    expect(run.summary.variants[0].quality.map((q) => q.task)).toEqual([task]);
  });

  it('lists every run and keeps Go values as the semantic source', () => {
    const entries = repository().repo.listRuns();

    expect(entries.map((e) => [e.id, e.state])).toEqual([
      ['replay-golden', 'ready'],
      ['text-golden', 'ready'],
      ['translation-golden', 'ready'],
    ]);
    const [classification] = entries;
    if (classification.state !== 'ready') throw new Error('not ready');
    const [trial] = classification.summary.variants[0].quality;
    const headline = primaryMetric(trial);
    expect(headline.label).toBe('category 정확도');
    expect(formatMeasure(headline.measure, headline.unit).text).toBe('33.3%');
  });

  it('reads the persisted comparison', () => {
    const { repo } = repository();

    expect(repo.listComparisons().map((e) => [e.id, e.state])).toEqual([[COMPARISON_ID, 'ready']]);
    expect(repo.getComparison(COMPARISON_ID).gate).toMatchObject({
      applicable: true,
      passed: true,
    });
  });

  it('orders recent runs first, then by id, and unreadable runs last', () => {
    const { repo, edit, file } = repository();
    edit('text-golden/metadata.json', (m) => (m.startedAt = '2026-09-23T06:00:00Z'));
    cpSync(file('replay-golden'), file('aaa-copy'), { recursive: true });
    edit('aaa-copy/metadata.json', (m) => (m.runId = 'aaa-copy'));
    mkdirSync(file('broken-run'));

    // text-golden이 가장 늦게 시작했고, 나머지 셋은 같은 시각이라 id 순, metadata가 없는 run은 맨 뒤다.
    expect(repo.listRuns().map((e) => e.id)).toEqual([
      'text-golden',
      'aaa-copy',
      'replay-golden',
      'translation-golden',
      'broken-run',
    ]);
    expect(repo.listRuns().map((e) => e.id)).toEqual(repo.listRuns().map((e) => e.id));
  });
});

describe('evaluation repository — missing and unsafe paths', () => {
  it('treats a missing results directory as no runs, and a missing run as not found', () => {
    const { root } = repository(false);
    rmSync(join(root, 'tools'), { recursive: true });
    const repo = evaluationRepository(root);

    expect(repo.listRuns()).toEqual([]);
    expect(repo.listComparisons()).toEqual([]);
    expectFailure(() => repo.getRun('run-a'), 'not-found');
    expectFailure(() => repo.getComparison('compare-a'), 'not-found');
  });

  it.each(['../secret', '..', 'a/b', 'a\\b', '%2e%2e', '', 'Upper', '.hidden', 'x'.repeat(129)])(
    'rejects the id %j before touching the filesystem',
    (id) => {
      const { repo } = repository();
      expectFailure(() => repo.getRun(id), 'invalid-id');
      expectFailure(() => repo.getComparison(id), 'invalid-id');
    },
  );

  it('does not follow a symlinked run out of the results directory', () => {
    const { repo, file } = repository();
    const outside = mkdtempSync(join(tmpdir(), 'devhub-outside-'));
    onTestFinished(() => rmSync(outside, { recursive: true, force: true }));
    cpSync(file('replay-golden'), join(outside, 'escaped'), { recursive: true });
    symlinkSync(join(outside, 'escaped'), file('escaped'));

    expect(repo.listRuns().map((e) => e.id)).not.toContain('escaped');
    expectFailure(() => repo.getRun('escaped'), 'not-found');
  });

  it('ignores unrelated files and names that are not artifact ids', () => {
    const { repo, file } = repository();
    writeFileSync(file('notes.txt'), 'hello');
    writeFileSync(file('.DS_Store'), '');
    mkdirSync(file('Not_An_Id'));

    expect(repo.listRuns().map((e) => e.id)).toEqual([
      'replay-golden',
      'text-golden',
      'translation-golden',
    ]);
    expectFailure(() => repo.getRun('comparisons'), 'not-found');
  });
});

describe('evaluation repository — invalid and incomplete artifacts fail explicitly', () => {
  it('reports an unsupported schemaVersion distinctly', () => {
    const { repo, edit } = repository();
    edit('replay-golden/metadata.json', (m) => (m.schemaVersion = 2));

    expectFailure(() => repo.getRun('replay-golden'), 'unsupported-schema', 'schemaVersion 2');
    const entry = repo.listRuns().find((e) => e.id === 'replay-golden');
    expect(entry?.state === 'error' && entry.error.kind).toBe('unsupported-schema');
  });

  it('rejects a truncated cases.jsonl', () => {
    const { repo, file } = repository();
    const cases = readFileSync(file('text-golden/cases.jsonl'), 'utf8');
    writeFileSync(file('text-golden/cases.jsonl'), cases.slice(0, -40));

    expectFailure(() => repo.getRun('text-golden'), 'invalid-artifact', 'cases.jsonl');
  });

  it('rejects metadata that is not JSON or breaks the contract', () => {
    const { repo, file, edit } = repository();
    writeFileSync(file('replay-golden/metadata.json'), '{"schemaVersion": 1,');
    edit('translation-golden/metadata.json', (m) => delete m.runId);

    expectFailure(() => repo.getRun('replay-golden'), 'invalid-artifact', 'not JSON');
    expectFailure(
      () => repo.getRun('translation-golden'),
      'invalid-artifact',
      'metadata.json.runId: expected string',
    );
  });

  it('rejects a run whose summary disagrees with its metadata', () => {
    const { repo, edit } = repository();
    edit('replay-golden/summary.json', (s) => (s.status = 'completed'));

    expectFailure(
      () => repo.getRun('replay-golden'),
      'invalid-artifact',
      'does not match metadata',
    );
  });

  it('reports a running run as incomplete but still lists what it is', () => {
    const { repo, edit } = repository();
    edit('text-golden/metadata.json', (m) => {
      m.status = 'running';
      m.finishedAt = null;
    });

    expectFailure(() => repo.getRun('text-golden'), 'incomplete', 'still running');
    const entry = repo.listRuns().find((e) => e.id === 'text-golden');
    expect(entry).toMatchObject({ state: 'error', error: { kind: 'incomplete' } });
    expect(entry?.metadata?.task).toBe('text-extraction');
  });

  it('reports a missing summary as incomplete with the command that regenerates it', () => {
    const { repo, file } = repository();
    rmSync(file('translation-golden/summary.json'));

    expectFailure(
      () => repo.getRun('translation-golden'),
      'incomplete',
      'pnpm eval report --run translation-golden',
    );
  });

  it('reports a malformed comparison in the list and on read', () => {
    const { repo, file, edit } = repository();
    edit(`comparisons/${COMPARISON_ID}/comparison.json`, (c) => (c.axes = 'not-a-list'));
    mkdirSync(file('comparisons/empty-comparison'));

    expect(repo.listComparisons().map((e) => [e.id, e.state])).toEqual([
      [COMPARISON_ID, 'error'],
      ['empty-comparison', 'error'],
    ]);
    expectFailure(() => repo.getComparison(COMPARISON_ID), 'invalid-artifact', 'axes');
    expectFailure(() => repo.getComparison('empty-comparison'), 'invalid-artifact', 'missing');
  });
});

describe('route entry', () => {
  it('waits for the request before reading, so /evals pages are not frozen at build time', async () => {
    const repo = await localEvaluations();

    expect(connection).toHaveBeenCalledTimes(1);
    expect(Object.keys(repo).sort()).toEqual([
      'getComparison',
      'getRun',
      'listComparisons',
      'listRuns',
      'variantCatalog',
    ]);
  });
});

describe('presentation', () => {
  it('shows a measured zero as a value and a missing measure with its reason', () => {
    expect(formatMeasure({ availability: 'measured', value: 0 }, 'rate')).toMatchObject({
      text: '0.0%',
      missing: false,
    });
    expect(
      formatMeasure(
        { availability: 'unsupported', value: null, reason: 'BLEU is not implemented' },
        'rate',
      ),
    ).toEqual({
      text: '지원 안 함',
      missing: true,
      availability: 'unsupported',
      reason: 'BLEU is not implemented',
    });
    expect(formatMeasure({ availability: 'measured', value: 1234 }, 'ms').text).toBe('1.2 s');
  });

  it('picks a task-appropriate headline without re-scoring', () => {
    const { repo } = repository();
    const headline = (id: string) => primaryMetric(repo.getRun(id).summary.variants[0].quality[0]);

    expect(headline('text-golden')).toMatchObject({
      label: 'corpus CER',
      direction: 'lower-is-better',
    });
    expect(headline('translation-golden')).toMatchObject({
      label: '보존 구간 재현율',
      unit: 'rate',
    });
  });
});
