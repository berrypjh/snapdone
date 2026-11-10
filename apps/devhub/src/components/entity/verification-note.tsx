import Link from 'next/link';

import { WorkspaceSection } from '@berrypjh/devhub-ui';

import type { Scenario } from '@/domain/model';
import { CONSTRAINT, GAP } from '@/lib/catalog/labels';
import { documentHref } from '@/lib/catalog/start-path';
import {
  CI_DOC,
  scenarioGaps,
  scenarioTests,
  TEST_RUNS,
  testRunsOf,
  verificationSummary,
} from '@/lib/catalog/verification';

const LINK = 'text-text-link underline-offset-2 hover:underline';

/**
 * 목록 한 줄에 붙는 검증 제한. 상태 칩(구현 여부) 옆에 글자로만 두어 둘이 다른 축임을 보인다.
 * 종류 두 개까지만 보이고 나머지는 수로 센다. 공백이 없으면 아무것도 그리지 않는다.
 */
export function VerificationLimits({ scenario }: { scenario: Scenario }) {
  const { shown, more } = verificationSummary(scenario);
  if (shown.length === 0) return null;
  return (
    <span className="typo-caption-small text-text-light">
      미검증: {shown.join(' · ')}
      {more > 0 && ` 외 ${more}`}
    </span>
  );
}

/** 시나리오 상세의 검증 범위. 무엇으로 확인했고(테스트) 무엇을 확인하지 못했는지(공백)를 상태와 떼어 적는다. */
export function VerificationSection({ scenario }: { scenario: Scenario }) {
  const runs = testRunsOf(scenarioTests(scenario));
  const gaps = scenarioGaps(scenario);
  return (
    <WorkspaceSection id="entity-verification" title="검증 범위">
      <p className="typo-caption-small text-text-light">
        상태 칩은 코드가 있다는 뜻이다. 아래 테스트는 시나리오가 인용한 근거이고, 이 커밋에서
        통과했다는 결과가 아니다. 결과는{' '}
        <Link href={documentHref(CI_DOC)} className={LINK}>
          CI
        </Link>
        나 로컬 실행에서 본다
      </p>

      <h3 className="typo-body-small-strong">자동 테스트</h3>
      {runs.length > 0 ? (
        <ul className="flex flex-col gap-1 typo-body-small">
          {runs.map((run) => {
            const how = TEST_RUNS[run.runner];
            return (
              <li key={run.runner} className="flex flex-wrap items-baseline gap-x-2">
                <span>
                  {how.label} {run.count}
                </span>
                <span className="devhub-code typo-caption-small">pnpm {how.script}</span>
                {run.requires.length > 0 && (
                  <span className="typo-caption-small text-text-warning">
                    {run.requires.map((constraint) => CONSTRAINT[constraint]).join(' · ')}
                  </span>
                )}
                <Link href={documentHref(how.doc)} className={`${LINK} typo-caption-small`}>
                  실행 방법
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="typo-body-small text-text-light">인용한 자동 테스트 없음</p>
      )}

      <h3 className="typo-body-small-strong">확인하지 못한 것</h3>
      {gaps.length > 0 ? (
        <ul className="flex flex-col gap-1 typo-body-small">
          {gaps.map((gap, index) => (
            <li key={index} className="flex flex-col">
              <span>
                <span className="typo-body-small-strong">{GAP[gap.kind]}</span> — {gap.note}
              </span>
              {gap.step && (
                <span className="typo-caption-small text-text-light">단계: {gap.step.intent}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="typo-body-small text-text-light">
          적힌 증거 공백 없음 — 자동 테스트가 덮는 범위까지만 확인됨
        </p>
      )}
    </WorkspaceSection>
  );
}
