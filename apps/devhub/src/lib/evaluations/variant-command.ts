import type { Task } from './contract';

/**
 * 명령 만들기의 모양과 명령 글자. 브라우저(`command-builder.tsx`)에서도 쓰므로 Node 모듈을 import하지 않는다.
 * 목록을 파일에서 읽는 것은 서버 전용 `variant-catalog.ts`다.
 */

export type VariantKind = 'baseline' | 'model' | 'experiment';

export type VariantOption = {
  /** `--variant`에 넣는 값. 설정 파일이면 id, 불러온 모델이면 `공급자:모델`. */
  ref: string;
  id: string;
  task: Task;
  kind: VariantKind;
  provider: string;
  model: string;
  apiKeyEnv: string | null;
  /** case 하나에 드는 최대 모델 호출. 기준선 0, 계단식 2, 그 밖 1. */
  callsPerCase: number;
  /** 실험 설정 이름. 없으면 null. */
  experiment: string | null;
  /** 목록에서 먼저 읽히는 이름. 식별자(ref)는 그 옆에 작게. */
  label: string;
};

export const PROVIDER_NAME: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  none: '모델 없음',
};

export type Split = 'dev' | 'validation' | 'held-out';

export const SPLITS: Split[] = ['dev', 'validation', 'held-out'];

/** dataset 하나와 split별 case 수(manifest 선언). */
export type DatasetOption = { name: string; task: Task; cases: Record<Split, number> };

/** 모델 없는 실험 설정(`tools/evals/experiments`). 고른 모델에 얹어 `--variant <id>@공급자:모델`로 실행한다. */
export type ExperimentOption = { id: string; label: string; cascade: boolean };

export type VariantCatalog = {
  variants: VariantOption[];
  experiments: ExperimentOption[];
  datasets: DatasetOption[];
};

/** 공급자 모델 목록 API에서 새로고침마다 불러온 모델. 설정 파일 없이 `공급자:모델`로 실행한다. */
export type ProviderModel = { id: string; name: string; created: string | null };

export type ProviderModelList = {
  provider: 'anthropic' | 'openai';
  /** ok — 불러옴, no-key — DevHub 프로세스에 key 없음, failed — 부름 실패(이유는 reason). */
  state: 'ok' | 'no-key' | 'failed';
  models: ProviderModel[];
  reason?: string;
};

export const PROVIDER_KEY: Record<ProviderModelList['provider'], string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/** 불러온 모델을 고를 수 있는 variant로. `--variant 공급자:모델`로 실행하고 id는 CLI와 같은 규칙이다. */
export const providerVariant = (
  provider: ProviderModelList['provider'],
  model: ProviderModel,
): VariantOption => ({
  ref: `${provider}:${model.id}`,
  id: model.id
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/^-+|-+$/g, ''),
  task: 'image-classification',
  kind: 'model',
  provider,
  model: model.id,
  apiKeyEnv: PROVIDER_KEY[provider],
  callsPerCase: 1,
  label: model.name,
  experiment: null,
});

/** 고른 variant로 만든 명령과 필요한 key. 모델 호출 상한은 SDK 재시도(최대 3번)까지 넉넉히 잡는다. */
/** 옵션 하나에 한 줄. 줄 끝 `\`로 이어지므로 그대로 복사해 실행된다. */
const lines = (head: string, args: string[]) => [head, ...args].join(' \\\n  ');

export const buildCommand = (
  selected: VariantOption[],
  dataset: DatasetOption,
  options: { oneCase: boolean; runId: string; split?: Split },
) => {
  const split = options.split ?? 'dev';
  const cases = options.oneCase ? Math.min(1, dataset.cases[split]) : dataset.cases[split];
  const calls = selected.reduce((sum, v) => sum + v.callsPerCase * cases, 0);
  const keys = [...new Set(selected.flatMap((v) => (v.apiKeyEnv ? [v.apiKeyEnv] : [])))].sort();
  const common = [
    `--dataset ${dataset.name}`,
    ...(split === 'dev' ? [] : [`--split ${split}`]),
    ...(split === 'held-out' ? ['--allow-held-out'] : []),
    ...selected.map((v) => `--variant ${v.ref}`),
    ...(options.oneCase ? ['--limit 1'] : []),
  ];
  const opt = calls > 0 ? ['--allow-api', `--max-api-calls ${calls * 3}`] : [];
  const plan = lines('pnpm eval plan', common);
  // 비어 있으면 CLI가 run-<UTC 시각>으로 정한다. 끝에 남은 `-`는 입력 중인 것이라 뗀다.
  const runId = options.runId.replace(/-+$/, '');
  const run = lines('pnpm eval run', [...common, ...opt, ...(runId ? [`--run-id ${runId}`] : [])]);
  return { calls, keys, plan, run };
};

/** 모델 목록의 한 줄. 저장소 설정과 공급자 목록에서 같은 모델이면 하나로 합친다. */
export type ModelChoice = { option: VariantOption; created: string | null; repo: boolean };

/**
 * 저장소 모델 설정과 새로고침 때 불러온 모델을 회사 구분 없이 한 목록으로. 같은 모델(모델 이름이 같음)은 저장소
 * 설정을 쓰고 출시일은 공급자 목록에서 가져온다. 출시일 최신순, 모르는 것은 뒤에 이름순.
 */
export const modelChoices = (repoModels: VariantOption[], providers: ProviderModelList[]) => {
  const live = providers.flatMap((list) =>
    list.models.map((m) => ({ option: providerVariant(list.provider, m), created: m.created })),
  );
  const choices: ModelChoice[] = repoModels.map((option) => {
    const same = live.find(
      (l) => l.option.provider === option.provider && l.option.model === option.model,
    );
    return {
      option: same ? { ...option, label: same.option.label } : option,
      created: same?.created ?? null,
      repo: true,
    };
  });
  for (const l of live) {
    if (!repoModels.some((r) => r.provider === l.option.provider && r.model === l.option.model)) {
      choices.push({ option: l.option, created: l.created, repo: false });
    }
  }
  return choices.sort(
    (a, b) =>
      (b.created ?? '').localeCompare(a.created ?? '') ||
      a.option.label.localeCompare(b.option.label),
  );
};

/** 실험 설정 하나를 모델에 얹은 variant. 계단식은 first가 먼저 답하고 불확실하면 second에 다시 묻는다. */
const withExperiment = (e: ExperimentOption, first: VariantOption, second?: VariantOption) => {
  const models = second ? `${first.model},${second.model}` : first.model;
  return {
    ...first,
    ref: `${e.id}@${first.provider}:${models}`,
    id: [e.id, first.id, ...(second ? [second.id] : [])].join('-'),
    kind: 'experiment',
    callsPerCase: second ? 2 : 1,
    experiment: e.label,
    label: `${e.label} · ${second ? `${first.label} → ${second.label}` : first.label}`,
  } satisfies VariantOption;
};

/**
 * 고른 실험 설정을 고른 모델마다 얹는다. 계단식은 같은 회사 모델이 정확히 둘일 때만(먼저 고른 것이 먼저 답함)
 * 만들고, 아니면 빠진다 — 이유는 `cascadeReady`로 보인다. 공급자 목록 모델(`공급자:모델`)에만 얹는다.
 */
export const experimentVariants = (experiments: ExperimentOption[], models: VariantOption[]) => {
  const inline = models.filter((m) => m.ref === `${m.provider}:${m.model}`);
  return experiments.flatMap((e) => {
    if (!e.cascade) return inline.map((m) => withExperiment(e, m));
    return cascadeReady(inline) ? [withExperiment(e, inline[0], inline[1])] : [];
  });
};

/** 계단식을 만들 수 있는지 — 같은 회사 모델 정확히 둘. */
export const cascadeReady = (models: VariantOption[]) =>
  models.length === 2 && models[0].provider === models[1].provider;
