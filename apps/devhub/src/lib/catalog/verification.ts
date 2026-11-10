import { catalog } from '../../data';
import type {
  CommandConstraint,
  DocumentLink,
  EvidenceGap,
  Scenario,
  ScenarioStep,
  TestRef,
} from '../../domain/model';

import { GAP } from './labels';

/**
 * 구현 상태와 검증 수준을 따로 읽게 하는 순수 함수. 상태(`ImplementationStatus`)는 코드가 있다는 뜻이고,
 * 무엇으로 확인했고 무엇을 확인하지 못했는지는 카탈로그의 `gaps` · `TestRef.requires`가 이미 가진다.
 * 여기서는 그 둘을 고르고 줄 세울 뿐 새 상태를 만들지 않는다.
 */

/** 한눈에 보일 때 먼저 둘 공백. 코드가 없거나 테스트가 깨진 것이 미검증보다 앞선다. */
export const GAP_PRIORITY: EvidenceGap['kind'][] = [
  'failing-test',
  'code-not-found',
  'symbol-not-resolved',
  'external-unverified',
  'runtime-unverified',
  'config-required',
  'no-test',
];

export type ScenarioGap = EvidenceGap & { step?: ScenarioStep };

/** 시나리오 전체의 공백. 시나리오에 적힌 것 먼저, 그다음 단계 순서대로. */
export const scenarioGaps = (scenario: Scenario): ScenarioGap[] => [
  ...scenario.gaps,
  ...scenario.steps.flatMap((step) => (step.gaps ?? []).map((gap) => ({ ...gap, step }))),
];

export type VerificationSummary = {
  /** 중요한 순서의 공백 종류 이름. 같은 종류는 한 번. */
  kinds: string[];
  /** 목록 한 줄에 보일 앞의 몇 개. */
  shown: string[];
  /** 보이지 않은 나머지 종류 수. */
  more: number;
};

/** 목록 한 줄용 요약. 종류가 `limit`개를 넘으면 앞의 것만 보이고 나머지는 수로 센다. */
export const verificationSummary = (scenario: Scenario, limit = 2): VerificationSummary => {
  const present = new Set(scenarioGaps(scenario).map((gap) => gap.kind));
  const kinds = GAP_PRIORITY.filter((kind) => present.has(kind)).map((kind) => GAP[kind]);
  return { kinds, shown: kinds.slice(0, limit), more: Math.max(0, kinds.length - limit) };
};

/**
 * 러너마다 어떻게 돌리는지. 명령은 루트 `package.json`의 script 이름이고, 설명의 정본은 품질 gate 문서다
 * (`verification.spec.ts`가 script와 제목이 실재하는지 대조). 테스트가 등록된 것과 이 커밋에서 통과한 것은
 * 다른 일이라, 결과는 CI · 로컬 실행에서만 본다.
 */
export const TEST_RUNS: Record<
  TestRef['runner'],
  { label: string; script: string; doc: DocumentLink }
> = {
  vitest: {
    label: 'Vitest',
    script: 'test',
    doc: { document: 'quality-gates', heading: '테스트 현황 — 솔직하게' },
  },
  'node-test': {
    label: 'node --test',
    script: 'test:hooks',
    doc: { document: 'quality-gates', heading: '테스트 현황 — 솔직하게' },
  },
  'go-test': {
    label: 'Go test',
    script: 'test',
    doc: { document: 'quality-gates', heading: 'Go' },
  },
  playwright: {
    label: 'Playwright',
    script: 'e2e',
    doc: { document: 'quality-gates', heading: 'E2E 범위' },
  },
};

export const CI_DOC: DocumentLink = {
  document: 'quality-gates',
  heading: 'CI (`.github/workflows/ci.yml`)',
};

export type TestRun = {
  runner: TestRef['runner'];
  count: number;
  /** 이 러너의 테스트가 요구하는 환경. 비면 어디서든 돈다. */
  requires: CommandConstraint[];
};

/** 테스트를 러너별로 센다. 순서는 `TEST_RUNS` 순서다. */
export const testRunsOf = (tests: TestRef[]): TestRun[] =>
  (Object.keys(TEST_RUNS) as TestRef['runner'][]).flatMap((runner) => {
    const mine = tests.filter((test) => test.runner === runner);
    if (mine.length === 0) return [];
    return [
      {
        runner,
        count: mine.length,
        requires: [...new Set(mine.flatMap((test) => test.requires))],
      },
    ];
  });

const testsById = new Map(catalog.tests.map((test) => [test.id, test]));

/** 시나리오의 단계와 공백이 인용한 테스트. 상세 정보 패널의 테스트 절과 같은 집합이다. */
export const scenarioTests = (scenario: Scenario): TestRef[] => {
  const ids = [
    ...scenario.steps.flatMap((step) => step.tests),
    ...scenarioGaps(scenario).flatMap((gap) => gap.tests ?? []),
  ];
  return [...new Set(ids)].flatMap((id) => testsById.get(id) ?? []);
};
