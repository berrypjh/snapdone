import type { ReactNode } from 'react';

import type { AnswerSource } from '@/lib/evaluations/presentation';

import { INSPECTOR_ID } from '../shell/workspace';
import { Icon, type IconName } from '../ui/icon';

import { AnswerSourceChip } from './answer-source-chip';

type Section = { id: string; title: string; icon: IconName };

const SOURCE: Section = { id: 'guide-source', title: '답 출처', icon: 'runtime' };
const BASELINE: Section = { id: 'guide-baseline', title: '규칙 기준선', icon: 'evaluation' };
const METRICS: Section = { id: 'guide-metrics', title: '지표', icon: 'record' };
const CAUTION: Section = { id: 'guide-caution', title: '읽을 때 주의', icon: 'help' };
const SECTIONS = [SOURCE, BASELINE, METRICS, CAUTION];

const SOURCES: [AnswerSource, ReactNode][] = [
  ['model', '이 run에서 모델을 실제로 부른 답 — 모델 성능은 이것만'],
  ['rule', '모델 없는 규칙의 답 — 아래 규칙 기준선'],
  [
    'recorded',
    <>
      <code className="devhub-code">tools/evals/predictions</code>의 예측을 다시 채점 — 호출 없음
    </>,
  ],
];

type Baseline = { id: string; name: string; text: string };

const BASELINES: Baseline[] = [
  {
    id: 'baseline-always-other',
    name: '늘 기타로 답함',
    text: '사진을 보지 않음. 이보다 못하면 쓸 이유 없음',
  },
  {
    id: 'baseline-nearest-case',
    name: '비슷한 사진의 정답 베끼기',
    text: '생김새만 비교하고 내용은 못 읽음. 모델이 사진을 읽는지 가림',
  },
];

type Metric = { term: string; text: string; lowerIsBetter?: boolean };

/** 묻는 질문별 묶음 — 맞혔나 · 끝낼 수 있나 · 믿어도 되나 · 실험 설정. 묶음 사이는 간격으로만 나눈다. */
const METRIC_GROUPS: Metric[][] = [
  [
    { term: 'category 정확도', text: '사진 종류(장소 · 일정 · 영수증 …)를 맞힌 몫' },
    { term: '허용 행동 정확도', text: '추천 행동이 정답이 허용한 행동에 든 몫' },
    { term: 'critical 비율', text: '나오면 안 되는 행동을 추천한 몫', lowerIsBetter: true },
  ],
  [
    { term: '추출값 재현율', text: '날짜 · 금액 · 이름처럼 읽어야 할 값 중 찾은 몫' },
    { term: '행동 완료 가능률', text: '맞는 행동을 고르고 필요한 값도 모두 읽은 몫' },
  ],
  [
    { term: 'high인데 틀림', text: '신뢰도 high로 답했는데 틀린 몫', lowerIsBetter: true },
    { term: '자동 실행 정확도 · 비율', text: '확인 없이 실행할 답이 맞은 몫 · 전체 중 그 몫' },
  ],
  [
    { term: '비슷한 사례 적중 · MRR', text: '붙인 예시 사진이 질문 사진과 같은 종류인지' },
    { term: '큰 모델 재질문 비율', text: '큰 모델에 다시 물은 몫 — 높을수록 비용 증가' },
  ],
];

const CAUTIONS: [string, ReactNode][] = [
  ['빈 값', '값 없음 · 측정 안 함 · 해당 없음은 0이 아님. 이유가 함께, 그래프 선은 끊김'],
  [
    '추세',
    <>
      비교 가능한 완료 run만 이은 참고 그림. 정식 비교 · 회귀 판정은{' '}
      <code className="devhub-code">pnpm eval compare</code>
    </>,
  ],
  ['공식 판정', 'replay · 합성 dataset · draft를 연 run은 공식 benchmark 아님 — run 상세에 이유'],
];

function GuideSection({
  section,
  summary,
  children,
}: {
  section: Section;
  /** 목록 앞의 한 줄. */
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${section.id}-heading`}
      id={section.id}
      className="flex flex-col gap-3 py-4 last:pb-0"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id={`${section.id}-heading`} className="flex items-center gap-2 typo-body-small-strong">
          <Icon name={section.icon} className="text-text-light" />
          {section.title}
        </h3>
        {summary && <p className="pl-6 typo-caption-small text-text-light">{summary}</p>}
      </div>
      {children}
    </section>
  );
}

function MetricList({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {metrics.map((m) => (
        <div key={m.term} className="flex flex-col">
          <dt className="flex items-baseline justify-between gap-2 typo-body-small">
            {m.term}
            {m.lowerIsBetter && (
              <span className="shrink-0 typo-caption-small text-text-light">낮을수록 좋음</span>
            )}
          </dt>
          <dd className="typo-caption-small text-text-light">{m.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `/evals`의 오른쪽 창. 상세 정보 창과 같은 자리 · 모양으로 표를 읽는 법을 보인다. */
export function EvalsGuide() {
  return (
    <aside
      id={INSPECTOR_ID}
      tabIndex={-1}
      aria-label="상세 정보"
      className="relative border-t border-stroke-light bg-background-surface lg:overflow-y-auto lg:border-t-0 lg:border-l"
    >
      <div className="flex flex-col divide-y divide-stroke-light p-4 pb-12">
        <header className="flex flex-col gap-2 pb-4">
          <p className="typo-caption-small text-text-light">평가</p>
          <h2 className="typo-body-medium-strong">읽는 법</h2>
          <nav aria-label="상세 목차">
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="inline-flex items-center gap-1 typo-caption-small text-text-link underline-offset-2 hover:underline"
                  >
                    <Icon name={section.icon} />
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <GuideSection section={SOURCE} summary="누가 답했든 지표는 나옴 — 숫자보다 출처 먼저">
          <dl className="flex flex-col gap-2.5">
            {SOURCES.map(([source, text]) => (
              <div key={source} className="flex flex-col items-start gap-1">
                <dt>
                  <AnswerSourceChip source={source} />
                </dt>
                <dd className="typo-caption-small text-text-light">{text}</dd>
              </div>
            ))}
          </dl>
        </GuideSection>

        <GuideSection
          section={BASELINE}
          summary="모델 없이 정한 규칙 — 모델이 넘어야 할 최저선. 호출이 없어 지연 0 ms · token 0"
        >
          <dl className="flex flex-col gap-2">
            {BASELINES.map((b) => (
              <div key={b.id} className="flex flex-col gap-0.5">
                <dt className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="typo-body-small">{b.name}</span>
                  <code className="devhub-code typo-caption-small text-text-light">{b.id}</code>
                </dt>
                <dd className="typo-caption-small text-text-light">{b.text}</dd>
              </div>
            ))}
          </dl>
        </GuideSection>

        <GuideSection
          section={METRICS}
          summary="분모는 고른 case 전체 — 실행 실패 · 미실행도 틀린 답으로 셈"
        >
          <div className="flex flex-col gap-4">
            {METRIC_GROUPS.map((metrics) => (
              <MetricList key={metrics[0].term} metrics={metrics} />
            ))}
          </div>
        </GuideSection>

        <GuideSection section={CAUTION}>
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
            {CAUTIONS.map(([term, text]) => (
              <div key={term} className="contents">
                <dt className="typo-caption-small text-text-light">{term}</dt>
                <dd className="typo-caption-small">{text}</dd>
              </div>
            ))}
          </dl>
        </GuideSection>
      </div>
    </aside>
  );
}
