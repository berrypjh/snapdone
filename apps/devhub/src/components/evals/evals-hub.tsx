import Link from 'next/link';

import { CopyButton, Icon, WorkspaceSection } from '@berrypjh/devhub-ui';
import { VisuallyHidden } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { comparisonHref } from '@/lib/evaluations/comparison';
import { TASKS } from '@/lib/evaluations/contract';
import { evalTaskHref, runHref, type RunRow } from '@/lib/evaluations/overview';
import {
  ANSWER_SOURCE,
  type AnswerSource,
  TASK_LABELS,
  TASK_NOTES,
} from '@/lib/evaluations/presentation';
import type { ComparisonEntry } from '@/lib/evaluations/repository';
import type { ProviderModelList, VariantCatalog } from '@/lib/evaluations/variant-command';

import { AnswerSourceChip } from './answer-source-chip';
import { CommandBuilder } from './command-builder';

const LINK = 'text-text-link underline-offset-2 hover:underline';
const SOURCES: AnswerSource[] = ['model', 'rule', 'recorded'];

/**
 * 비교할 수 있는 대상 하나. 예시는 `tools/evals/variants` · `experiments` · `predictions`의 실제 파일이거나(spec이 확인),
 * 파일 없이 쓰는 `--variant` 값이다.
 */
export type Target = { name: string; setting: string; example: string; note: string };

export const TARGETS: Target[] = [
  {
    name: '여러 모델 · 공급자',
    setting: 'provider:model — 파일 없음',
    example: '--variant anthropic:<모델> · openai:<모델>',
    note: '같은 지시 · 같은 채점, 모델만 다름',
  },
  {
    name: 'OpenAI 호환 서비스(Grok 등)',
    setting: 'provider openai + endpoint',
    example: 'variants/local.example.json',
    note: '모델 이름 · 이미지 입력 · 구조화 출력 지원은 공식 문서로 확인',
  },
  {
    name: '내 컴퓨터의 오픈소스(Ollama)',
    setting: 'endpoint http://localhost:11434/v1, key 없음',
    example: 'variants/local.example.json',
    note: '이미지를 읽는 모델이어야 함 · 비용 없음',
  },
  {
    name: '지시문(프롬프트) 변경',
    setting: 'facts-prompt@공급자:모델 · config.promptPath',
    example: 'experiments/facts-prompt.json',
    note: '지시문만 바꿈 — 결과 schema · 검증은 그대로',
  },
  {
    name: '비슷한 사례 예시',
    setting: 'similar-cases@공급자:모델 · config.retrieval.k',
    example: 'experiments/similar-cases.json',
    note: 'dev 사례만 예시로 붙임',
  },
  {
    name: '계단식',
    setting: 'cascade@공급자:작은 모델,큰 모델 · config.cascade',
    example: 'experiments/cascade.json',
    note: '작은 모델이 불확실하면 큰 모델에 다시 물음',
  },
  {
    name: '규칙 기준선',
    setting: 'adapter baseline',
    example: 'variants/baseline-always-other.json',
    note: '호출 없음 · key 없이 live로 실행',
  },
  {
    name: '기록 재채점',
    setting: 'pnpm eval replay --predictions',
    example: 'predictions/sample-classification.jsonl',
    note: '호출 없음 · 기록된 예측 파일(notebook 실험의 출력 포함)을 다시 채점',
  },
];

/** 정식 run을 만드는 명령. 값은 전부 Go가 쓰고, 이 화면은 그 결과를 읽기만 한다. */
const METHODS: { name: string; note: string; command: string }[] = [
  {
    name: '한 run으로 — 권장',
    note: '모든 variant가 같은 사례를 한 번에 풀어 run 상세에 나란히. 모델을 부르면 --allow-api와 호출 상한이 필요',
    command:
      'pnpm eval run --dataset <dataset> --variant <a> --variant <b> --allow-api --max-api-calls <N> --run-id <run>',
  },
  {
    name: '짝 비교 · gate',
    note: '두 run의 variant를 둘씩 견줌. dataset 버전 · 사례 · 채점 규칙 · 채점 코드가 같아야 하고, gate 규칙 파일(tools/evals/gates)을 주면 Go가 통과 여부를 판정',
    command:
      'pnpm eval compare --baseline <run>:<variant> --candidate <run>:<variant> [--gate tools/evals/gates/<name>.json]',
  },
  {
    name: '먼저 계획만',
    note: '호출 0 — 고른 사례 수 · 호출 수 · 빠진 key를 확인',
    command: 'pnpm eval plan --dataset <dataset> --variant <a> --allow-api --max-api-calls <N>',
  },
];

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-md bg-background-default p-3 devhub-code">{children}</pre>
);

/** 접는 섹션. 제목(h2)은 summary 안에 있어 제목 탐색에 그대로 잡힌다. 여러 개를 함께 열 수 있다. */
function Fold({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      id={id}
      className="rounded-lg border border-stroke-light bg-background-surface p-4"
    >
      <details className="group flex flex-col gap-3">
        <summary className="cursor-pointer list-none">
          <h2
            id={`${id}-heading`}
            className="inline-flex items-center gap-1.5 typo-body-small-strong"
          >
            <Icon name="chevron-right" className="text-text-light group-open:rotate-90" />
            {title}
          </h2>
        </summary>
        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </details>
    </section>
  );
}

/** 과제별 하위 화면 — 한 줄 요약과 run 수 · 최근 run. */
function Tasks({ rows }: { rows: RunRow[] }) {
  return (
    <WorkspaceSection id="evals-tasks" title={`과제 ${TASKS.length}개`}>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {TASKS.map((task) => {
          const runs = rows.filter((r) => r.task === task);
          return (
            <li key={task} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <span className="flex items-center justify-between gap-3">
                <Link href={evalTaskHref(task)} className={`typo-body-small-strong ${LINK}`}>
                  {TASK_LABELS[task]}
                </Link>
                <span className="typo-body-small">
                  {runs.length}
                  <VisuallyHidden> 개 run</VisuallyHidden>
                </span>
              </span>
              <span className="typo-caption-small text-text-light">
                {TASK_NOTES[task]}
                {runs[0] && (
                  <>
                    {' · 최근 '}
                    <Link href={runHref(runs[0].id)} className={`devhub-code ${LINK}`}>
                      {runs[0].id}
                    </Link>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </WorkspaceSection>
  );
}

function Methods() {
  return (
    <WorkspaceSection id="evals-methods" title="정식 run을 만드는 명령">
      <ol className="flex flex-col divide-y divide-stroke-light">
        {METHODS.map((m, i) => (
          <li key={m.name} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
            <span className="typo-body-small-strong">
              {i + 1}. {m.name}
            </span>
            <span className="typo-caption-small text-text-light">{m.note}</span>
            <div className="relative">
              <Code>{m.command}</Code>
              <span className="absolute top-1.5 right-1.5">
                <CopyButton text={m.command} label={`${m.name} 명령 복사: ${m.command}`} />
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-1.5 typo-caption-small text-text-light">
        <Icon name="overview" className="mt-0.5" />
        <span>
          일부 모델만 실패했으면{' '}
          <span className="devhub-code">pnpm eval retry --run &lt;run id&gt;</span> — 성공한 결과는
          호출 없이 옮기고 실패한 것만 다시 불러 한 run(
          <span className="devhub-code">&lt;run id&gt;-retry</span>)에 모음. 명령은 그 run 상세에
        </span>
      </p>
    </WorkspaceSection>
  );
}

function Targets() {
  return (
    <Fold id="evals-targets" title={`비교할 수 있는 것 ${TARGETS.length}가지 — 설정 이름과 예시`}>
      <p className="typo-caption-small text-text-light">
        비교 대상 하나 = <code className="devhub-code">--variant</code> 하나. 모델 이름은 파일에
        적지 않고 실행할 때 고름 — 모델만이면{' '}
        <code className="devhub-code">anthropic:&lt;모델&gt;</code>, 실험이면{' '}
        <code className="devhub-code">&lt;설정&gt;@anthropic:&lt;모델&gt;</code>(설정은{' '}
        <code className="devhub-code">tools/evals/experiments</code>)
      </p>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {TARGETS.map((t) => (
          <li key={t.name} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
            <span className="typo-body-small-strong">{t.name}</span>
            <span className="typo-caption-small text-text-light">{t.note}</span>
            <span className="typo-caption-small">
              <span className="text-text-light">설정 </span>
              <code className="devhub-code">{t.setting}</code>
              <span className="text-text-light"> · 예시 </span>
              <code className="devhub-code">{t.example}</code>
            </span>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

function Sources({ rows }: { rows: RunRow[] }) {
  const count = (source: AnswerSource) =>
    rows.filter((r) => r.variants.some((v) => v.source === source)).length;
  return (
    <Fold id="evals-sources" title={`답 출처별 run — 실제 모델 호출 ${count('model')}개`}>
      <ul className="flex flex-col gap-2">
        {SOURCES.map((source) => (
          <li key={source} className="flex items-center justify-between gap-3">
            <AnswerSourceChip source={source} />
            <span className="typo-body-small">
              {count(source)}
              <VisuallyHidden> 개 run — {ANSWER_SOURCE[source].label}</VisuallyHidden>
            </span>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

function Comparisons({ comparisons }: { comparisons: ComparisonEntry[] }) {
  return (
    <Fold id="evals-comparisons" title={`저장된 짝 비교 ${comparisons.length}개`}>
      {comparisons.length === 0 ? (
        <p className="typo-caption-small text-text-light">없음 — 짝 비교 명령으로 만듦</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-light">
          {comparisons.map((entry) => (
            <li key={entry.id} className="py-2 first:pt-0 last:pb-0">
              <Link href={comparisonHref(entry.id)} className={`devhub-code ${LINK}`}>
                {entry.id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  );
}

/**
 * `/evals` — 평가의 첫 화면. 정식 결과를 보는 곳이다. 과제 · 정식 run 명령 만들기 · 명령 예시는 열어 두고, 참고(비교할 수
 * 있는 것 · 답 출처별 run · 저장된 짝 비교)는 개수를 적은 제목으로 접는다. 탐색 · 실험은 `tools/evals/lab`의 notebook이
 * 하고, 여기서는 정식 run의 Go 명령 글자만 만든다. 최신 모델은 서버가 새로고침마다 공급자 목록에서 불러와 넘긴다.
 */
export function EvalsHub({
  rows,
  comparisons,
  catalog,
  providers,
}: {
  rows: RunRow[];
  comparisons: ComparisonEntry[];
  catalog: VariantCatalog;
  providers: ProviderModelList[];
}) {
  const withModel = rows.filter((r) => r.variants.some((v) => v.source === 'model')).length;
  return (
    <>
      <p className="typo-body-small">
        같은 사진 · 같은 정답 · 같은 채점으로 모델 · 지시 · 설정을 나란히 비교.{' '}
        <span className="text-text-light">
          값은 <code className="devhub-code">tools/evals/results</code>에 Go가 쓴 산출물 그대로.
          탐색 · 지시문 실험 · 임계값 조사는 <code className="devhub-code">tools/evals/lab</code>의
          notebook에서 하고, 그 결과는 replay로 정식 run이 된 뒤 여기 보인다
        </span>
      </p>
      {withModel === 0 && (
        <p className="flex items-start gap-1.5 typo-caption-small text-text-warning">
          <Icon name="warning" className="mt-0.5" />
          실제 모델을 호출한 run 없음 — 지금 지표는 모델 성능 아님
        </p>
      )}
      <Tasks rows={rows} />
      <WorkspaceSection id="evals-new" title="정식 run 명령 만들기">
        <CommandBuilder catalog={catalog} providers={providers} />
      </WorkspaceSection>
      <Methods />
      <Targets />
      <Sources rows={rows} />
      <Comparisons comparisons={comparisons} />
    </>
  );
}
