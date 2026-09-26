import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluationRepository, RESULTS_DIR } from '../lib/evaluations/repository';

import { ROOT } from './repository-files';

/**
 * 임시 저장소 root에 Go가 만든 golden 산출물을 복사한다. 올바른 run은 전부 실제 Go 산출물이고, 사례는 그
 * 복사본을 고쳐 만든다. 쓰는 spec은 `afterEach(removeResults)`로 지운다.
 */

export const GOLDEN = join(ROOT, 'apps/api/internal/evaluation/testdata');
export const GOLDEN_RUNS = {
  classification: 'replay-golden',
  text: 'text-golden',
  translation: 'translation-golden',
} as const;
export const COMPARISON_ID = JSON.parse(
  readFileSync(join(GOLDEN, 'comparisons/replay-pair/comparison.json'), 'utf8'),
).comparisonId as string;

const roots: string[] = [];

export const removeResults = () =>
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));

/** 결과 root가 있는 임시 저장소. withGoldens면 세 run과 comparison 하나를 복사한다. */
export const resultsRepository = (withGoldens = true) => {
  const root = mkdtempSync(join(tmpdir(), 'devhub-evals-'));
  roots.push(root);
  const results = join(root, RESULTS_DIR);
  mkdirSync(results, { recursive: true });
  if (withGoldens) {
    for (const run of Object.values(GOLDEN_RUNS)) {
      cpSync(join(GOLDEN, 'artifacts', run), join(results, run), { recursive: true });
    }
    cpSync(join(GOLDEN, 'comparisons/replay-pair'), join(results, 'comparisons', COMPARISON_ID), {
      recursive: true,
    });
  }
  const file = (path: string) => join(results, path);
  const edit = (path: string, change: (value: Record<string, unknown>) => void) => {
    const value = JSON.parse(readFileSync(file(path), 'utf8'));
    change(value);
    writeFileSync(file(path), JSON.stringify(value));
  };
  /** run 하나를 새 id로 복사하고 metadata · summary의 runId를 맞춘다. */
  const copyRun = (from: string, to: string) => {
    cpSync(file(from), file(to), { recursive: true });
    edit(`${to}/metadata.json`, (m) => (m.runId = to));
    edit(`${to}/summary.json`, (s) => (s.runId = to));
  };
  /** Go comparison golden(`testdata/comparisons/<name>`) 하나를 그 comparisonId로 복사하고 id를 돌려준다. */
  const copyComparison = (name: string) => {
    const source = join(GOLDEN, 'comparisons', name);
    const id = JSON.parse(readFileSync(join(source, 'comparison.json'), 'utf8'))
      .comparisonId as string;
    cpSync(source, join(results, 'comparisons', id), { recursive: true });
    return id;
  };
  return { root, results, file, edit, copyRun, copyComparison, repo: evaluationRepository(root) };
};
