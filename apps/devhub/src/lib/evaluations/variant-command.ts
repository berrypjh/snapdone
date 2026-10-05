import type { Task } from './contract';

/**
 * 정식 run 명령 만들기의 모양과 명령 글자. 브라우저(`command-builder.tsx`)에서도 쓰므로 Node 모듈을 import하지 않는다.
 * 목록을 파일에서 읽는 것은 서버 전용 `variant-catalog.ts`다. 모델 이름은 어느 파일에도 없으므로 사용자가 적는다 —
 * DevHub는 공급자를 부르지 않는다.
 */

export type VariantKind = 'baseline' | 'model' | 'experiment';

export type VariantOption = {
  /** `--variant`에 넣는 값. 설정 파일이면 id, 적은 모델이면 `공급자:모델`, 실험이면 `설정@공급자:모델`. */
  ref: string;
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

/** Go CLI의 `공급자:모델` 참조가 받는 공급자와 그 key 환경변수(`evaluation.VariantRef`와 같다). */
export const PROVIDER_KEY: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export type Split = 'dev' | 'validation' | 'held-out';

export const SPLITS: Split[] = ['dev', 'validation', 'held-out'];

/** dataset 하나와 split별 case 수(manifest 선언). */
export type DatasetOption = { name: string; task: Task; cases: Record<Split, number> };

/** 모델 없는 실험 설정(`tools/evals/experiments`). 적은 모델에 얹어 `--variant <id>@공급자:모델`로 실행한다. */
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

/** 불러온 모델을 고를 수 있는 variant로. `--variant 공급자:모델`로 실행한다. */
export const providerVariant = (
  provider: ProviderModelList['provider'],
  model: ProviderModel,
): VariantOption => ({
  ref: `${provider}:${model.id}`,
  task: 'image-classification',
  kind: 'model',
  provider,
  model: model.id,
  apiKeyEnv: PROVIDER_KEY[provider],
  callsPerCase: 1,
  experiment: null,
  label: model.name,
});

/** 모델 목록의 한 줄. */
export type ModelChoice = { option: VariantOption; created: string | null };

/** 불러온 모델을 회사 구분 없이 한 목록으로. 출시일 최신순, 모르는 것은 뒤에 이름순. */
export const modelChoices = (providers: ProviderModelList[]): ModelChoice[] =>
  providers
    .flatMap((list) =>
      list.models.map((m) => ({ option: providerVariant(list.provider, m), created: m.created })),
    )
    .sort(
      (a, b) =>
        (b.created ?? '').localeCompare(a.created ?? '') ||
        a.option.label.localeCompare(b.option.label),
    );

/**
 * 사용자가 직접 적은 `공급자:모델` 한 줄을 variant로(목록에 없거나 key 없이 띄웠을 때). 공급자를 모르거나 모델이
 * 비면 null이다. 값의 검증(모델이 있는지 · key가 있는지)은 `pnpm eval plan`이 한다.
 */
export const modelVariant = (text: string): VariantOption | null => {
  const ref = text.trim();
  const at = ref.indexOf(':');
  if (at < 1 || /\s/.test(ref)) return null;
  const provider = ref.slice(0, at);
  const model = ref.slice(at + 1);
  if (!(provider in PROVIDER_KEY) || model === '') return null;
  return {
    ref,
    task: 'image-classification',
    kind: 'model',
    provider,
    model,
    apiKeyEnv: PROVIDER_KEY[provider],
    callsPerCase: 1,
    experiment: null,
    label: model,
  };
};

/** 여러 줄(또는 쉼표)로 적은 모델을 순서대로. 못 읽은 줄은 따로 돌려준다. */
export const parseModels = (text: string) => {
  const models: VariantOption[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/[\n,]/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const option = modelVariant(trimmed);
    if (!option) invalid.push(trimmed);
    else if (!models.some((m) => m.ref === option.ref)) models.push(option);
  }
  return { models, invalid };
};

/** 옵션 하나에 한 줄. 줄 끝 `\`로 이어지므로 그대로 복사해 실행된다. */
const lines = (head: string, args: string[]) => [head, ...args].join(' \\\n  ');

/** 고른 variant로 만든 명령과 필요한 key. 모델 호출 상한은 SDK 재시도(최대 3번)까지 넉넉히 잡는다. */
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

/** 실험 설정 하나를 모델에 얹은 variant. 계단식은 first가 먼저 답하고 불확실하면 second에 다시 묻는다. */
const withExperiment = (e: ExperimentOption, first: VariantOption, second?: VariantOption) => {
  const models = second ? `${first.model},${second.model}` : first.model;
  return {
    ...first,
    ref: `${e.id}@${first.provider}:${models}`,
    kind: 'experiment',
    callsPerCase: second ? 2 : 1,
    experiment: e.label,
    label: `${e.label} · ${second ? `${first.label} → ${second.label}` : first.label}`,
  } satisfies VariantOption;
};

/**
 * 고른 실험 설정을 적은 모델마다 얹는다. 계단식은 같은 회사 모델이 정확히 둘일 때만(먼저 적은 것이 먼저 답함)
 * 만들고, 아니면 빠진다 — 이유는 `cascadeReady`로 보인다.
 */
export const experimentVariants = (experiments: ExperimentOption[], models: VariantOption[]) =>
  experiments.flatMap((e) => {
    if (!e.cascade) return models.map((m) => withExperiment(e, m));
    return cascadeReady(models) ? [withExperiment(e, models[0], models[1])] : [];
  });

/** 계단식을 만들 수 있는지 — 같은 회사 모델 정확히 둘. */
export const cascadeReady = (models: VariantOption[]) =>
  models.length === 2 && models[0].provider === models[1].provider;
