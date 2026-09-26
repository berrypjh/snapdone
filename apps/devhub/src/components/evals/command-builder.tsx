'use client';

import { type ReactNode, useState } from 'react';

import { Checkbox, IconButton, TextField } from '@berrypjh/react-ui';

import { TASKS } from '@/lib/evaluations/contract';
import { TASK_LABELS } from '@/lib/evaluations/presentation';
import {
  buildCommand,
  cascadeReady,
  type ExperimentOption,
  experimentVariants,
  type ModelChoice,
  modelChoices,
  PROVIDER_KEY,
  PROVIDER_NAME,
  type ProviderModelList,
  type Split,
  SPLITS,
  type VariantCatalog,
  type VariantOption,
} from '@/lib/evaluations/variant-command';

import { CopyButton } from '../source/copy-button';
import { Icon } from '../ui/icon';

/** run id 규칙(소문자 · 숫자 · -)에 맞춘다. 입력 중인 끝의 `-`는 남긴다. 비워 두면 CLI가 시각으로 정한다. */
const cleanRunId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64);

type Toggle = { isOn: (ref: string) => boolean; set: (ref: string, on: boolean) => void };

/** 고를 것 한 줄 — 이름은 왼쪽, 부가 정보는 오른쪽 끝에 작게. 실제 모델 이름 · `--variant` 값은 title에. */
function Choice({ option, meta, toggle }: { option: VariantOption; meta: string; toggle: Toggle }) {
  return (
    <li className="flex min-h-9 items-center" title={`${option.model} · --variant ${option.ref}`}>
      <Checkbox
        checked={toggle.isOn(option.ref)}
        onChange={(event) => toggle.set(option.ref, event.currentTarget.checked)}
      >
        <span className="typo-body-small">{option.label}</span>
      </Checkbox>
      {meta && (
        <span className="ml-auto shrink-0 pl-3 typo-caption-small text-text-light">{meta}</span>
      )}
    </li>
  );
}

function ChoiceList({
  items,
  meta,
  toggle,
}: {
  items: VariantOption[];
  meta: (v: VariantOption) => string;
  toggle: Toggle;
}) {
  return items.length === 0 ? (
    <p className="typo-caption-small text-text-light">없음</p>
  ) : (
    <ul className="flex flex-col">
      {items.map((v) => (
        <Choice key={v.ref} option={v} meta={meta(v)} toggle={toggle} />
      ))}
    </ul>
  );
}

/** 실험 설정 — 모델이 없어 고른 모델마다 얹힌다. title은 `--variant` 모양. */
function ExperimentList({ items, toggle }: { items: ExperimentOption[]; toggle: Toggle }) {
  return items.length === 0 ? (
    <p className="typo-caption-small text-text-light">없음</p>
  ) : (
    <ul className="flex flex-col">
      {items.map((e) => (
        <li
          key={e.id}
          className="flex min-h-9 items-center"
          title={`--variant ${e.id}@공급자:모델${e.cascade ? ',다시 물을 모델' : ''}`}
        >
          <Checkbox
            checked={toggle.isOn(`${e.id}@`)}
            onChange={(event) => toggle.set(`${e.id}@`, event.currentTarget.checked)}
          >
            <span className="typo-body-small">{e.label}</span>
          </Checkbox>
          <span className="ml-auto shrink-0 pl-3 typo-caption-small text-text-light">
            {e.cascade ? '같은 회사 모델 2개 · 먼저 고른 것이 먼저 답함' : '고른 모델마다'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 늘 보이는 묶음. 제목과 한 줄 설명. */
function Group({ title, note, children }: { title: string; note: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="flex flex-col gap-0.5 pb-1">
        <span className="typo-body-small-strong">{title}</span>
        <span className="typo-caption-small text-text-light">{note}</span>
      </legend>
      {children}
    </fieldset>
  );
}

/** 접힌 묶음. 제목에 수와 고른 수를 적어 열지 않아도 무엇이 들었는지 안다. */
function FoldGroup({
  title,
  count,
  picked,
  children,
}: {
  title: string;
  count: string;
  picked: number;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border border-stroke-light">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3">
        <span className="inline-flex items-center gap-1.5 typo-body-small-strong">
          <Icon name="chevron-right" className="text-text-light group-open:rotate-90" />
          {title}
        </span>
        <span className="typo-caption-small text-text-light">
          {count}
          {picked > 0 && ` · ${picked}개 고름`}
        </span>
      </summary>
      <fieldset className="border-t border-stroke-light px-3 py-2">
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </details>
  );
}

/** DevHub 필터(`entity/filter-bar`)와 같은 모양의 작은 글자 버튼. */
const FILTER =
  'inline-flex min-h-8 items-center rounded-md px-2 typo-caption-small text-text-link hover:bg-background-default aria-pressed:bg-(--ds-background-selected) aria-pressed:text-text-default aria-pressed:typo-body-small-strong';

/** 처음 보이는 모델 수. 나머지는 접는다. */
const SHOWN = 10;

/** 공급자 목록을 불러왔는지 짧게. 자세한 이유는 title에. */
function ProviderStatus({ providers }: { providers: ProviderModelList[] }) {
  const short = (l: ProviderModelList) =>
    l.state === 'ok'
      ? `${l.models.length}개`
      : l.state === 'no-key'
        ? 'key 없음'
        : `실패(${l.reason})`;
  const detail = (l: ProviderModelList) =>
    l.state === 'no-key' ? `${PROVIDER_KEY[l.provider]} 없이 DevHub를 띄움` : '';
  return (
    <span title={providers.map(detail).filter(Boolean).join(' · ') || undefined}>
      최신 목록 {providers.map((l) => `${PROVIDER_NAME[l.provider]} ${short(l)}`).join(' · ')}
    </span>
  );
}

/**
 * 모델을 회사 구분 없이 한 목록으로(출시일 최신순). 회사는 줄마다 표시하고, 회사 필터로 좁힌다. 앞의
 * SHOWN개만 보이고 나머지는 접는다.
 */
function ModelPicker({ choices, toggle }: { choices: ModelChoice[]; toggle: Toggle }) {
  const [company, setCompany] = useState<string | null>(null);
  const companies = [...new Set(choices.map((c) => c.option.provider))];
  const visible = choices.filter((c) => !company || c.option.provider === company);
  const meta = (c: ModelChoice) =>
    [
      PROVIDER_NAME[c.option.provider] ?? c.option.provider,
      c.created && `출시 ${c.created}`,
      !c.repo && '새로 불러옴',
    ]
      .filter(Boolean)
      .join(' · ');
  const list = (items: ModelChoice[]) => (
    <ul className="flex flex-col">
      {items.map((c) => (
        <Choice key={c.option.ref} option={c.option} meta={meta(c)} toggle={toggle} />
      ))}
    </ul>
  );
  const rest = visible.slice(SHOWN);
  const restPicked = rest.filter((c) => toggle.isOn(c.option.ref)).length;
  return (
    <div className="flex flex-col gap-2">
      {companies.length > 1 && (
        <div role="group" aria-label="회사로 좁히기" className="flex flex-wrap gap-1">
          {[null, ...companies].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={company === c}
              onClick={() => setCompany(c)}
              className={FILTER}
            >
              {company === c && <span aria-hidden="true">✓&nbsp;</span>}
              {c ? (PROVIDER_NAME[c] ?? c) : '전체'}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className="typo-caption-small text-text-light">없음 — 이 회사의 모델 없음</p>
      ) : (
        list(visible.slice(0, SHOWN))
      )}
      {rest.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 typo-caption-small text-text-link">
            <Icon name="chevron-right" className="group-open:rotate-90" />
            나머지 {rest.length}개 더 보기{restPicked > 0 && ` · ${restPicked}개 고름`}
          </summary>
          <div className="mt-1">{list(rest)}</div>
        </details>
      )}
    </div>
  );
}

/** 명령 한 블록 — 제목 줄 오른쪽에 복사, 글자는 선택할 수 있고 옵션마다 한 줄. */
function Command({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="typo-caption-small text-text-light">{title}</p>
        <CopyButton text={text} label={`${title} 복사`} variant="icon" />
      </div>
      <pre className="overflow-x-auto rounded-md bg-background-surface p-3 devhub-code">{text}</pre>
    </div>
  );
}

const KIND: Record<VariantOption['kind'], string> = {
  baseline: '기준선',
  model: '모델',
  experiment: '실험',
};

const SELECT =
  'min-h-8 rounded-md border border-stroke-light bg-background-surface px-2 typo-body-small text-text-default';

/** 이보다 많이 고르면 목록을 접고 종류별 수만 보인다. */
const CHOSEN_OPEN = 4;

/** 고른 것 — 종류별 수 한 줄과 빼기 목록. 많으면 목록은 접는다(왼쪽 체크와 같은 정보라서). */
function ChosenList({ chosen, toggle }: { chosen: VariantOption[]; toggle: Toggle }) {
  const counts = (Object.keys(KIND) as VariantOption['kind'][])
    .map((kind) => [KIND[kind], chosen.filter((v) => v.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name} ${n}`)
    .join(' · ');
  const list = (
    <ul className="flex flex-col">
      {chosen.map((v) => (
        <li key={v.ref} className="flex items-center justify-between gap-2">
          <span className="min-w-0 typo-body-small">
            {v.label}
            {v.label !== v.ref && (
              <span className="typo-caption-small text-text-light"> · {v.ref}</span>
            )}
          </span>
          <IconButton
            size="sm"
            aria-label={`${v.label} 빼기`}
            onClick={() => toggle.set(v.ref, false)}
          >
            <Icon name="close" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <p className="typo-caption-small text-text-light">{counts}</p>
      {chosen.length > CHOSEN_OPEN ? (
        <details className="group">
          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 typo-caption-small text-text-link">
            <Icon name="chevron-right" className="group-open:rotate-90" />
            목록 · 빼기
          </summary>
          {list}
        </details>
      ) : (
        list
      )}
    </>
  );
}

/**
 * 새 비교 실행. 왼쪽에서 고르고 오른쪽(넓은 화면에서는 따라옴)에서 고른 것 · 옵션 · 명령을 본다. 모델을 부르지 않고
 * 명령 글자만 만든다 — 실행과 key 입력은 사용자의 터미널. 최신 모델은 서버가 새로고침마다 불러와 넘긴다.
 */
export function CommandBuilder({
  catalog,
  providers,
}: {
  catalog: VariantCatalog;
  providers: ProviderModelList[];
}) {
  const datasets = catalog.datasets;
  const runnable = (name: string) => {
    const d = datasets.find((x) => x.name === name);
    return !!d && catalog.variants.some((v) => v.task === d.task);
  };
  const [datasetName, setDatasetName] = useState(
    datasets.find((d) => runnable(d.name))?.name ?? '',
  );
  const [split, setSplit] = useState<Split>('dev');
  const [selected, setSelected] = useState<string[]>([]);
  const [oneCase, setOneCase] = useState(true);
  const [runId, setRunId] = useState('');

  const dataset = datasets.find((d) => d.name === datasetName);
  if (!dataset) {
    return (
      <p className="typo-caption-small text-text-light">
        없음 — 고를 수 있는 dataset · variant 설정이 없음
      </p>
    );
  }
  const photo = dataset.task === 'image-classification';
  const repo = catalog.variants.filter((v) => v.task === dataset.task);
  const baselines = repo.filter((v) => v.kind === 'baseline');
  const models = repo.filter((v) => v.kind === 'model');
  const experiments = photo ? catalog.experiments : [];
  const choices = modelChoices(models, photo ? providers : []);
  const all = [...baselines, ...choices.map((c) => c.option)];
  // 모델은 고른 순서대로 — 계단식은 먼저 고른 모델이 먼저 답한다.
  const chosenModels = selected.flatMap((ref) =>
    choices.filter((c) => c.option.ref === ref).map((c) => c.option),
  );
  const pickedExperiments = experiments.filter((e) => selected.includes(`${e.id}@`));
  const chosen = [
    ...all.filter((v) => v.kind === 'baseline' && selected.includes(v.ref)),
    ...chosenModels,
    ...experimentVariants(pickedExperiments, chosenModels),
  ];
  const cascadeWaiting = pickedExperiments.some((e) => e.cascade) && !cascadeReady(chosenModels);
  // 실험 variant(`설정@공급자:모델`)를 빼면 그 설정을 뺀다.
  const keyOf = (ref: string) => (ref.includes('@') ? ref.slice(0, ref.indexOf('@') + 1) : ref);
  const toggle: Toggle = {
    isOn: (ref) => selected.includes(keyOf(ref)),
    set: (ref, on) => {
      const key = keyOf(ref);
      setSelected((current) =>
        on ? [...current.filter((x) => x !== key), key] : current.filter((x) => x !== key),
      );
    },
  };
  const add = (items: VariantOption[]) =>
    setSelected((current) => [
      ...current,
      ...items.map((v) => v.ref).filter((ref) => !current.includes(ref)),
    ]);
  const repoMeta = (v: VariantOption) =>
    v.kind === 'baseline' ? '호출 없음' : `${PROVIDER_NAME[v.provider] ?? v.provider} · ${v.ref}`;
  const command =
    chosen.length > 0 ? buildCommand(chosen, dataset, { oneCase, runId, split }) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Group title="규칙 기준선" note="모델 없이 규칙으로 답함 — 모델 옆에 함께 두기를 권장">
          <ChoiceList items={baselines} meta={repoMeta} toggle={toggle} />
        </Group>
        <Group
          title="모델"
          note={
            <>
              최신순
              {photo && providers.length > 0 && (
                <>
                  {' · '}
                  <ProviderStatus providers={providers} />
                </>
              )}
            </>
          }
        >
          <ModelPicker choices={choices} toggle={toggle} />
        </Group>
        <div className="flex flex-col gap-2">
          <FoldGroup
            title="실험 설정"
            count={`${experiments.length}개 · 고른 모델에 얹음`}
            picked={pickedExperiments.length}
          >
            <ExperimentList items={experiments} toggle={toggle} />
          </FoldGroup>
        </div>
      </div>

      <aside
        aria-label="고른 것과 명령"
        className="flex h-fit flex-col gap-4 rounded-lg bg-background-default p-4 xl:sticky xl:top-4"
      >
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="typo-body-small-strong">고른 것 {chosen.length}개</h3>
            <span className="flex flex-wrap gap-1">
              <button type="button" className={FILTER} onClick={() => add(baselines)}>
                + 기준선
              </button>
              {chosen.length > 0 && (
                <button type="button" className={FILTER} onClick={() => setSelected([])}>
                  모두 해제
                </button>
              )}
            </span>
          </div>
          {cascadeWaiting && (
            <p className="typo-caption-small text-text-warning">
              계단식 — 같은 회사 모델을 정확히 2개 고르면 명령에 들어감(먼저 고른 모델이 먼저 답함)
            </p>
          )}
          {chosen.length === 0 ? (
            <p className="typo-caption-small text-text-light">
              왼쪽에서 하나 이상 고르면 명령이 만들어짐
            </p>
          ) : (
            <ChosenList chosen={chosen} toggle={toggle} />
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-stroke-light pt-3">
          <h3 className="typo-body-small-strong">옵션</h3>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <label className="flex flex-col gap-1 typo-caption-small text-text-light">
              dataset
              <select
                value={datasetName}
                onChange={(event) => {
                  setDatasetName(event.currentTarget.value);
                  setSplit('dev');
                  setSelected([]);
                }}
                className={SELECT}
              >
                {TASKS.filter((t) => datasets.some((d) => d.task === t)).map((t) => (
                  <optgroup key={t} label={TASK_LABELS[t]}>
                    {datasets
                      .filter((d) => d.task === t)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((d) => (
                        <option key={d.name} value={d.name} disabled={!runnable(d.name)}>
                          {d.name}
                          {!runnable(d.name) && ' — 기록 재채점만'}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 typo-caption-small text-text-light">
              split
              <select
                value={split}
                onChange={(event) => setSplit(event.currentTarget.value as Split)}
                className={SELECT}
              >
                {SPLITS.map((sp) => (
                  <option key={sp} value={sp} disabled={dataset.cases[sp] === 0}>
                    {sp} · {dataset.cases[sp]}건{sp === 'held-out' && ' — 마지막 확인용'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <TextField
              size="sm"
              label="run id"
              placeholder="비우면 run-시각"
              value={runId}
              onChange={(event) => setRunId(cleanRunId(event.currentTarget.value))}
            />
            <Checkbox
              checked={oneCase}
              onChange={(event) => setOneCase(event.currentTarget.checked)}
            >
              1건만 — 처음엔 연결 확인부터
            </Checkbox>
          </div>
        </section>

        {command && (
          <section
            className="flex flex-col gap-3 border-t border-stroke-light pt-3"
            aria-live="polite"
          >
            <div className="flex flex-col gap-0.5">
              <h3 className="typo-body-small-strong">명령</h3>
              <p className="typo-caption-small text-text-light">
                {split} {oneCase ? '1건' : `${dataset.cases[split]}건`} · 모델 호출 최대{' '}
                {command.calls}번
                {command.keys.length === 0
                  ? ' · key 필요 없음'
                  : ' · 별도 터미널에서, key는 값을 직접 넣음'}
              </p>
            </div>
            {command.keys.length > 0 && (
              <Command
                title="1. key 설정"
                text={command.keys.map((key) => `export ${key}='실제 key'`).join('\n')}
              />
            )}
            <Command title={`${command.keys.length > 0 ? 2 : 1}. 실행`} text={command.run} />
            {runId === '' && (
              <p className="typo-caption-small text-text-light">
                run id 없음 — 실행 시각(UTC)으로 저장. 예:{' '}
                <code className="devhub-code">run-20260926-051200</code>
              </p>
            )}
            <details className="group">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 typo-caption-small text-text-link">
                <Icon name="chevron-right" className="group-open:rotate-90" />
                먼저 호출 없이 계획 보기
              </summary>
              <div className="mt-1">
                <Command title="계획 — 호출 수 · 빠진 key 확인" text={command.plan} />
              </div>
            </details>
          </section>
        )}
      </aside>
    </div>
  );
}
