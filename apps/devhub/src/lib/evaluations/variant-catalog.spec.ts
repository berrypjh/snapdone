import { describe, expect, it } from 'vitest';

import { ROOT } from '../../test-support/repository-files';

import { readVariantCatalog } from './variant-catalog';
import {
  buildCommand,
  cascadeReady,
  type DatasetOption,
  experimentVariants,
  modelChoices,
  providerVariant,
} from './variant-command';

const catalog = readVariantCatalog(ROOT);
const pick = (...ids: string[]) =>
  ids.map((id) => {
    const found = catalog.variants.find((v) => v.id === id);
    if (!found) throw new Error(`no variant ${id}`);
    return found;
  });
const sample = catalog.datasets.find((d) => d.name === 'sample-classification');
/** 명령 글자만 보는 테스트용 dataset. 저장소 dataset은 사용자가 채우므로 기대지 않는다. */
const pilot: DatasetOption = {
  name: 'my-photos',
  task: 'image-classification',
  cases: { dev: 21, validation: 0, 'held-out': 0 },
};
const haikuModel = {
  id: 'claude-haiku-4-5-20251001',
  name: 'Claude Haiku 4.5',
  created: '2025-10-01',
};
const haiku = providerVariant('anthropic', haikuModel);
const luna = providerVariant('openai', {
  id: 'gpt-6-luna',
  name: 'gpt-6-luna',
  created: '2026-03-01',
});

describe('variant catalog', () => {
  it('reads real manifests by kind and leaves out placeholders', () => {
    const [baseline] = pick('baseline-always-other');

    // 모델 이름은 어느 파일에도 없다 — 모델은 공급자 목록에서 오고, 실험 설정은 모델 없이 따로 있다.
    expect(catalog.variants.some((v) => v.kind !== 'baseline' && !v.id.includes('replay'))).toBe(
      false,
    );
    expect(baseline).toMatchObject({ kind: 'baseline', apiKeyEnv: null, callsPerCase: 0 });
    expect(catalog.experiments).toEqual([
      { id: 'cascade', label: '계단식', cascade: true },
      { id: 'facts-prompt', label: '지시문 변경', cascade: false },
      { id: 'similar-cases', label: '비슷한 사례 예시', cascade: false },
    ]);
    expect(catalog.variants.some((v) => v.id === 'anthropic-example')).toBe(false);
    // 저장소에는 과제마다 형식 예시 1건만 있다.
    expect(sample).toEqual({
      name: 'sample-classification',
      task: 'image-classification',
      cases: { dev: 1, validation: 0, 'held-out': 0 },
    });
    // 기록 재채점 전용 dataset도 목록에 있다(화면이 고를 수 없다고 표시).
    expect(catalog.datasets.map((d) => d.name)).toContain('sample-translation');
  });
});

describe('experiments on chosen models', () => {
  const [cascade, facts] = catalog.experiments;
  const opus = providerVariant('anthropic', {
    id: 'claude-big',
    name: 'Claude Big',
    created: null,
  });

  it('puts a setting on every chosen model as setting@provider:model', () => {
    const made = experimentVariants([facts], [haiku, luna]);

    expect(made.map((v) => v.ref)).toEqual([
      'facts-prompt@anthropic:claude-haiku-4-5-20251001',
      'facts-prompt@openai:gpt-6-luna',
    ]);
    expect(made[0]).toMatchObject({
      id: 'facts-prompt-claude-haiku-4-5-20251001',
      kind: 'experiment',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      callsPerCase: 1,
      label: '지시문 변경 · Claude Haiku 4.5',
    });
  });

  it('builds a cascade only from two models of one company, first chosen answers first', () => {
    expect(experimentVariants([cascade], [haiku, opus])).toMatchObject([
      {
        ref: 'cascade@anthropic:claude-haiku-4-5-20251001,claude-big',
        id: 'cascade-claude-haiku-4-5-20251001-claude-big',
        callsPerCase: 2,
      },
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
    expect(run.replaceAll(' \\\n  ', ' ')).toBe(
      'pnpm eval run --dataset my-photos --variant baseline-always-other --variant anthropic:claude-haiku-4-5-20251001 --variant openai:gpt-6-luna --allow-api --max-api-calls 126 --run-id cheap-models',
    );
    expect(plan.replaceAll(' \\\n  ', ' ')).toContain('pnpm eval plan --dataset my-photos');
  });

  it('adds the split, and the held-out opt-in, when not dev', () => {
    const dataset = { ...pilot, cases: { dev: 21, validation: 7, 'held-out': 7 } };
    const flat = (split: 'validation' | 'held-out') =>
      buildCommand([haiku], dataset, {
        oneCase: false,
        runId: 'v',
        split,
      }).run.replaceAll(' \\\n  ', ' ');

    expect(flat('validation')).toContain('--dataset my-photos --split validation --variant');
    expect(flat('validation')).not.toContain('--allow-held-out');
    expect(flat('held-out')).toContain('--split held-out --allow-held-out');
    expect(
      buildCommand([haiku], dataset, {
        oneCase: false,
        runId: 'v',
        split: 'validation',
      }).calls,
    ).toBe(7);
  });

  it('needs no opt-in for baselines and limits a connection check to one case', () => {
    expect(
      buildCommand(pick('baseline-always-other'), pilot, { oneCase: false, runId: 'b' }).run,
    ).not.toContain('--allow-api');
    const smoke = buildCommand([haiku], pilot, { oneCase: true, runId: 'smoke' });
    expect(smoke.calls).toBe(1);
    expect(smoke.run.replaceAll(' \\\n  ', ' ')).toContain(
      '--limit 1 --allow-api --max-api-calls 3',
    );
  });

  it('leaves the run id to the CLI when it is empty and drops a dash still being typed', () => {
    const baseline = pick('baseline-always-other');
    expect(buildCommand(baseline, pilot, { oneCase: false, runId: '' }).run).not.toContain(
      '--run-id',
    );
    expect(buildCommand(baseline, pilot, { oneCase: false, runId: 'haiku-' }).run).toMatch(
      /--run-id haiku$/,
    );
  });
});

// 저장소에 모델만 고르는 파일을 두면(지금은 없음) 공급자 목록의 같은 모델과 한 줄로 합친다.
const repoModel = (ref: string, option: typeof haiku) => ({ ...option, ref, id: ref, label: ref });

describe('one model list', () => {
  it('merges a repo model with the same listed model and sorts newest first', () => {
    const choices = modelChoices(
      [repoModel('claude-haiku-4-5', haiku)],
      [
        {
          provider: 'anthropic',
          state: 'ok',
          models: [haikuModel, { id: 'claude-new', name: 'Claude New', created: '2026-09-01' }],
        },
        {
          provider: 'openai',
          state: 'ok',
          models: [{ id: 'gpt-6-luna', name: 'gpt-6-luna', created: '2026-03-01' }],
        },
      ],
    );

    expect(choices.map((c) => c.option.ref)).toEqual([
      'anthropic:claude-new',
      'openai:gpt-6-luna',
      'claude-haiku-4-5',
    ]);
    // 같은 모델은 한 줄 — 저장소 설정으로 실행하고 이름 · 출시일은 공급자 목록에서.
    expect(choices[2]).toMatchObject({
      repo: true,
      created: '2025-10-01',
      option: { label: 'Claude Haiku 4.5' },
    });
  });

  it('keeps repo models without a date when no provider list was loaded', () => {
    const choices = modelChoices(
      [repoModel('haiku', haiku), repoModel('luna', luna)],
      [{ provider: 'anthropic', state: 'no-key', models: [] }],
    );

    expect(choices.map((c) => [c.option.ref, c.created, c.repo])).toEqual([
      ['haiku', null, true],
      ['luna', null, true],
    ]);
  });
});
