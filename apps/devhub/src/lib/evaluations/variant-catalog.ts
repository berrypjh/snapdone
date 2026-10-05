import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Task, TASKS } from './contract';
import {
  type DatasetOption,
  type ExperimentOption,
  type Split,
  SPLITS,
  type VariantCatalog,
  type VariantOption,
} from './variant-command';

/**
 * 정식 run 명령 만들기에서 고를 수 있는 variant · 실험 설정 · dataset. `tools/evals/variants` · `experiments` · `datasets`에서 이름과 종류만
 * 읽는다. 검증은 Go(`pnpm eval plan`)가 하므로 여기서는 읽을 수 없거나 예시(placeholder)인 것을 빼기만 한다.
 */

type Json = Record<string, unknown>;

const readJson = (path: string): Json | null => {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Json)
      : null;
  } catch {
    return null;
  }
};

const isTask = (value: unknown): value is Task =>
  typeof value === 'string' && (TASKS as readonly string[]).includes(value);

const experimentOf = (config: Json) =>
  config.promptPath
    ? '지시문 변경'
    : config.retrieval
      ? '비슷한 사례 예시'
      : config.cascade
        ? '계단식'
        : null;

/** 기준선이 무엇을 답하는지. 예: 늘 other / none. */
const baselineLabel = (config: Json) => {
  const b = (
    typeof config.baseline === 'object' && config.baseline !== null ? config.baseline : {}
  ) as Json;
  return b.strategy === 'nearest'
    ? '가장 비슷한 사진의 정답 베끼기'
    : `늘 ${String(b.category ?? '?')} / ${String(b.suggestedAction ?? '?')}`;
};

const variantOf = (doc: Json): VariantOption | null => {
  const { id, task, adapter, provider, model, apiKeyEnv, placeholder } = doc;
  if (placeholder === true || typeof id !== 'string' || !isTask(task)) return null;
  if (typeof provider !== 'string' || typeof model !== 'string') return null;
  const config = (typeof doc.config === 'object' && doc.config !== null ? doc.config : {}) as Json;
  const baseline = adapter === 'baseline';
  const experiment = baseline ? null : experimentOf(config);
  return {
    ref: id,
    task,
    kind: baseline ? 'baseline' : experiment ? 'experiment' : 'model',
    provider,
    model,
    apiKeyEnv: typeof apiKeyEnv === 'string' && apiKeyEnv !== '' ? apiKeyEnv : null,
    callsPerCase: baseline ? 0 : config.cascade ? 2 : 1,
    experiment,
    label: baseline ? baselineLabel(config) : (experiment ?? id),
  };
};

const experimentOptionOf = (doc: Json): ExperimentOption | null => {
  const config = (typeof doc.config === 'object' && doc.config !== null ? doc.config : {}) as Json;
  const label = experimentOf(config);
  return typeof doc.id === 'string' && label
    ? { id: doc.id, label, cascade: Boolean(config.cascade) }
    : null;
};

const jsonFiles = (dir: string) => {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
};

const subdirectories = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

/** 서버 전용 — 파일을 읽는다. 브라우저 코드는 `variant-command.ts`만 가져온다. */
export const readVariantCatalog = (root: string): VariantCatalog => {
  const variantsDir = join(root, 'tools/evals/variants');
  const variants = jsonFiles(variantsDir).flatMap((name) => {
    const doc = readJson(join(variantsDir, name));
    const option = doc && variantOf(doc);
    return option ? [option] : [];
  });
  const experimentsDir = join(root, 'tools/evals/experiments');
  const experiments = jsonFiles(experimentsDir).flatMap((name) => {
    const doc = readJson(join(experimentsDir, name));
    const option = doc && experimentOptionOf(doc);
    return option ? [option] : [];
  });
  const datasetsDir = join(root, 'tools/evals/datasets');
  const datasets = subdirectories(datasetsDir).flatMap((name): DatasetOption[] => {
    const manifest = readJson(join(datasetsDir, name, 'manifest.json'));
    const splits = (manifest?.splits ?? {}) as Record<string, Json | undefined>;
    const count = (split: Split) =>
      typeof splits[split]?.cases === 'number' ? (splits[split].cases as number) : 0;
    return manifest && isTask(manifest.task)
      ? [
          {
            name,
            task: manifest.task,
            cases: Object.fromEntries(SPLITS.map((s) => [s, count(s)])) as Record<Split, number>,
          },
        ]
      : [];
  });
  return { variants, experiments, datasets };
};
