import { describe, expect, it } from 'vitest';

import { read } from '../../test-support/repository-files';

import type { Task } from './contract';
import {
  ContractError,
  decodeCaseLines,
  decodeCaseResult,
  decodeComparison,
  decodeMeasure,
  decodeRunMetadata,
  decodeRunSummary,
} from './decode';

/**
 * Go가 실제 writer · Summarize · Compare로 만든 v1 golden을 그대로 읽는다. 손으로 쓴 가짜 모양이 아니다.
 * golden은 `EVAL_UPDATE_GOLDEN=1 go -C apps/api test ./internal/evaluation`으로 갱신된다.
 */

const TESTDATA = 'apps/api/internal/evaluation/testdata';
const RUNS: { dir: string; task: Task }[] = [
  { dir: `${TESTDATA}/artifacts/replay-golden`, task: 'image-classification' },
  { dir: `${TESTDATA}/artifacts/text-golden`, task: 'text-extraction' },
  { dir: `${TESTDATA}/artifacts/translation-golden`, task: 'translation' },
];
const COMPARISON = `${TESTDATA}/comparisons/replay-pair/comparison.json`;

const json = (path: string): Record<string, unknown> => JSON.parse(read(path));
const firstCase = (dir: string): Record<string, unknown> =>
  JSON.parse(read(`${dir}/cases.jsonl`).split('\n')[0]);

describe('Go-generated v1 run artifacts', () => {
  it.each(RUNS)('decode $task metadata, cases, and summary', ({ dir, task }) => {
    const metadata = decodeRunMetadata(json(`${dir}/metadata.json`));
    const cases = decodeCaseLines(read(`${dir}/cases.jsonl`));
    const summary = decodeRunSummary(json(`${dir}/summary.json`));

    expect(metadata.task).toBe(task);
    expect(cases.map((c) => c.caseId)).toEqual(metadata.selectedCaseIds);
    expect(new Set(cases.map((c) => c.task))).toEqual(new Set([task]));
    expect(summary.runId).toBe(metadata.runId);
    expect(summary.variants.flatMap((v) => v.quality.map((q) => q.task))).toEqual([task]);
  });

  it('keep measured zero apart from a missing value', () => {
    const [passed] = decodeCaseLines(read(`${RUNS[0].dir}/cases.jsonl`));

    expect(passed.metrics['critical-error']).toEqual({ availability: 'measured', value: 0 });
    expect(passed.usage.inputTokens).toEqual({
      availability: 'unavailable',
      value: null,
      reason: 'not recorded',
    });
    expect(passed.durationMs.availability).toBe('not-measured');
  });

  it('carry task-specific prediction, input, and quality shapes', () => {
    const [classification] = decodeCaseLines(read(`${RUNS[0].dir}/cases.jsonl`));
    const [ocr] = decodeCaseLines(read(`${RUNS[1].dir}/cases.jsonl`));
    const translation = decodeCaseLines(read(`${RUNS[2].dir}/cases.jsonl`));
    const translationSummary = decodeRunSummary(json(`${RUNS[2].dir}/summary.json`));

    expect(classification.task === 'image-classification' && classification.expected.intent).toBe(
      'resolved',
    );
    expect(ocr.task === 'text-extraction' && ocr.prediction?.fields).toEqual({
      store: '테스트카페',
      합계: '12,800원',
    });
    expect(translation.map((c) => [c.execution.status, c.prediction === null])).toEqual([
      ['completed', false],
      ['completed', false],
      ['not-run', true],
    ]);
    const textSummary = decodeRunSummary(json(`${RUNS[1].dir}/summary.json`));
    const [textTrial] = textSummary.variants[0].quality;
    expect(textTrial.task === 'text-extraction' && textTrial.quality.fieldStats).toEqual([
      expect.objectContaining({
        id: 'store',
        evaluated: 1,
        wrong: 1,
        accuracy: { availability: 'measured', value: 0 },
      }),
      expect.objectContaining({
        id: 'total',
        important: 1,
        correct: 1,
        accuracy: { availability: 'measured', value: 1 },
      }),
    ]);
    const [trial] = translationSummary.variants[0].quality;
    expect(trial.task === 'translation' && trial.quality.semanticSimilarity.availability).toBe(
      'unsupported',
    );
    expect(translationSummary.status).toBe('partial');
  });

  it('decode the persisted comparison read model', () => {
    const comparison = decodeComparison(json(COMPARISON));

    expect(comparison.comparable).toBe(true);
    expect(comparison.gate).toMatchObject({ applicable: true, passed: true });
    expect(comparison.axes.map((a) => a.axis)).toEqual([
      'quality',
      'reliability',
      'latency',
      'cost',
    ]);
  });
});

describe('v1 decoder refusals', () => {
  const refuses = (decode: () => unknown, message: string) =>
    expect(decode).toThrow(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  it('rejects an unknown schemaVersion with an actionable message', () => {
    const bump = (value: Record<string, unknown>) => ({ ...value, schemaVersion: 2 });

    refuses(
      () => decodeRunMetadata(bump(json(`${RUNS[0].dir}/metadata.json`))),
      'run metadata schemaVersion 2 is not supported; DevHub reads v1. Regenerate',
    );
    refuses(() => decodeCaseResult(bump(firstCase(RUNS[0].dir))), 'case result schemaVersion 2');
    refuses(
      () => decodeRunSummary(bump(json(`${RUNS[0].dir}/summary.json`))),
      'run summary schemaVersion 2',
    );
    refuses(() => decodeComparison(bump(json(COMPARISON))), 'comparison schemaVersion 2');
  });

  it('rejects a Measure whose availability and value disagree', () => {
    refuses(
      () => decodeMeasure({ availability: 'measured', value: null }, 'm'),
      'measured has a value',
    );
    refuses(
      () => decodeMeasure({ availability: 'unavailable', value: 0, reason: 'x' }, 'm'),
      'no value',
    );
    refuses(() => decodeMeasure({ availability: 'unavailable', value: null }, 'm'), 'has a reason');
    refuses(() => decodeMeasure({ availability: '', value: null }, 'm'), 'm.availability');
  });

  it('rejects a missing required field with its path', () => {
    const metadata = json(`${RUNS[0].dir}/metadata.json`);
    delete metadata.runId;

    expect(() => decodeRunMetadata(metadata)).toThrow(ContractError);
    refuses(() => decodeRunMetadata(metadata), 'metadata.runId: expected string, got undefined');
  });

  it('rejects an expected branch that does not match the task', () => {
    const line = firstCase(RUNS[0].dir);
    const text = firstCase(RUNS[1].dir);

    refuses(
      () => decodeCaseResult({ ...line, expected: text.expected }),
      'expected exactly the classification branch, got textExtraction',
    );
  });

  it('rejects a trial quality with more than one task branch', () => {
    const summary = json(`${RUNS[1].dir}/summary.json`);
    const [variant] = summary.variants as { quality: Record<string, unknown>[] }[];
    variant.quality[0].translation = variant.quality[0].text;

    refuses(
      () => decodeRunSummary(summary),
      'expected exactly the text branch, got text, translation',
    );
  });

  it('reads a text summary without the optional fieldStats as an empty list', () => {
    const summary = json(`${RUNS[1].dir}/summary.json`);
    const [variant] = summary.variants as { quality: { text: Record<string, unknown> }[] }[];
    delete variant.quality[0].text.fieldStats;
    const [trial] = decodeRunSummary(summary).variants[0].quality;

    expect(trial.task === 'text-extraction' && trial.quality.fieldStats).toEqual([]);
  });

  it('rejects a truncated cases.jsonl', () => {
    const text = read(`${RUNS[0].dir}/cases.jsonl`);

    refuses(() => decodeCaseLines(text.slice(0, -1)), 'the last line is truncated');
  });
});
