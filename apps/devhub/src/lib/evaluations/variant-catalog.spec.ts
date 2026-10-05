import { describe, expect, it } from 'vitest';

import { ROOT } from '../../test-support/repository-files';

import { readVariantCatalog } from './variant-catalog';
import {
  buildCommand,
  cascadeReady,
  type DatasetOption,
  experimentVariants,
  modelVariant,
  parseModels,
} from './variant-command';

const catalog = readVariantCatalog(ROOT);
const pick = (...refs: string[]) =>
  refs.map((ref) => {
    const found = catalog.variants.find((v) => v.ref === ref);
    if (!found) throw new Error(`no variant ${ref}`);
    return found;
  });
const sample = catalog.datasets.find((d) => d.name === 'sample-classification');
/** 명령 글자만 보는 테스트용 dataset. 저장소 dataset은 사용자가 채우므로 기대지 않는다. */
const pilot: DatasetOption = {
  name: 'my-photos',
  task: 'image-classification',
  cases: { dev: 21, validation: 0, 'held-out': 0 },
};
const must = (text: string) => {
  const option = modelVariant(text);
  if (!option) throw new Error(`not a model ${text}`);
  return option;
};
const haiku = must('anthropic:claude-haiku-4-5-20251001');
const luna = must('openai:gpt-6-luna');

describe('variant catalog', () => {
  it('reads real manifests by kind and leaves out placeholders', () => {
    const [baseline] = pick('baseline-always-other');

    // 모델 이름은 어느 파일에도 없다 — 사용자가 적고, 실험 설정은 모델 없이 따로 있다.
    expect(catalog.variants.every((v) => v.kind === 'baseline')).toBe(true);
    expect(baseline).toMatchObject({ kind: 'baseline', apiKeyEnv: null, callsPerCase: 0 });
    expect(catalog.experiments).toEqual([
      { id: 'cascade', label: '계단식', cascade: true },
      { id: 'facts-prompt', label: '지시문 변경', cascade: false },
      { id: 'similar-cases', label: '비슷한 사례 예시', cascade: false },
    ]);
    expect(catalog.variants.some((v) => v.ref === 'replay-example')).toBe(false);
    expect(sample).toEqual({
      name: 'sample-classification',
      task: 'image-classification',
      cases: { dev: 1, validation: 0, 'held-out': 0 },
    });
    // 기록 재채점 전용 dataset도 목록에 있다(화면이 고를 수 없다고 표시).
    expect(catalog.datasets.map((d) => d.name)).toContain('sample-translation');
  });
});

describe('typed models', () => {
  it('reads provider:model lines and refuses what Go would not accept as a ref', () => {
    expect(haiku).toMatchObject({
      ref: 'anthropic:claude-haiku-4-5-20251001',
      kind: 'model',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      callsPerCase: 1,
    });
    expect(luna.apiKeyEnv).toBe('OPENAI_API_KEY');
    for (const bad of ['gemini:flash', 'claude-opus-5', 'anthropic:', 'openai:a b', '']) {
      expect(modelVariant(bad), bad).toBeNull();
    }
    const { models, invalid } = parseModels('anthropic:a\n openai:b , anthropic:a\nnope\n');
    expect(models.map((m) => m.ref)).toEqual(['anthropic:a', 'openai:b']);
    expect(invalid).toEqual(['nope']);
  });
});

describe('experiments on typed models', () => {
  const [cascade, facts] = catalog.experiments;
  const opus = must('anthropic:claude-big');

  it('puts a setting on every model as setting@provider:model', () => {
    const made = experimentVariants([facts], [haiku, luna]);

    expect(made.map((v) => v.ref)).toEqual([
      'facts-prompt@anthropic:claude-haiku-4-5-20251001',
      'facts-prompt@openai:gpt-6-luna',
    ]);
    expect(made[0]).toMatchObject({
      kind: 'experiment',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      callsPerCase: 1,
      label: '지시문 변경 · claude-haiku-4-5-20251001',
    });
  });

  it('builds a cascade only from two models of one company, first typed answers first', () => {
    expect(experimentVariants([cascade], [haiku, opus])).toMatchObject([
      { ref: 'cascade@anthropic:claude-haiku-4-5-20251001,claude-big', callsPerCase: 2 },
    ]);
    expect(cascadeReady([haiku, luna])).toBe(false);
    expect(experimentVariants([cascade], [haiku])).toEqual([]);
    expect(experimentVariants([cascade], [haiku, opus, luna])).toEqual([]);
  });
});

describe('command builder', () => {
  it('builds a run with every needed key and a budget for SDK retries', () => {
    const { calls, keys, run, plan } = buildCommand(
      [...pick('baseline-always-other'), haiku, luna],
      pilot,
      { oneCase: false, runId: 'cheap-models' },
    );

    expect(calls).toBe(42);
    expect(keys).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
    // 옵션마다 한 줄, 줄 끝 `\`로 이어져 쉘에서는 한 줄 명령과 같다.
    expect(run.split('\n')).toEqual([
      'pnpm eval run \\',
      '  --dataset my-photos \\',
      '  --variant baseline-always-other \\',
      '  --variant anthropic:claude-haiku-4-5-20251001 \\',
      '  --variant openai:gpt-6-luna \\',
      '  --allow-api \\',
      '  --max-api-calls 126 \\',
      '  --run-id cheap-models',
    ]);
    expect(plan).not.toContain('--allow-api');
  });

  it('needs no key or opt-in for baselines only, and opens held-out explicitly', () => {
    const baselines = buildCommand(pick('baseline-always-other'), pilot, {
      oneCase: true,
      runId: '',
    });
    expect(baselines.keys).toEqual([]);
    expect(baselines.run).not.toContain('--allow-api');
    expect(baselines.run).toContain('--limit 1');
    expect(baselines.run).not.toContain('--run-id');

    const final = buildCommand(
      [haiku],
      { ...pilot, cases: { ...pilot.cases, 'held-out': 5 } },
      {
        oneCase: false,
        runId: 'final-',
        split: 'held-out',
      },
    );
    expect(final.run).toContain('--split held-out \\\n  --allow-held-out');
    expect(final.run).toContain('--max-api-calls 15');
    expect(final.run).toContain('--run-id final');
  });
});
