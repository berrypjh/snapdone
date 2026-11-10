import Link from 'next/link';

import { WorkspaceSection } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { swaggerDocument } from '@/data/apis';
import type { Endpoint } from '@/lib/catalog/endpoints';
import { stepHref } from '@/lib/catalog/entities';
import { sourceHref } from '@/lib/repository/source-usage';

const LINK = 'typo-body-small text-text-link underline-offset-2 hover:underline';

/** 한 줄짜리 근거 묶음. 비어 있으면 숨기지 않고 `empty`를 쓴다. */
function Row({ term, empty, children }: { term: string; empty?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="typo-caption-small text-text-light">{term}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {children ?? <span className="typo-caption-small text-text-light">{empty}</span>}
      </dd>
    </div>
  );
}

/** Swagger가 말하는 것만. 요약 · tag · 인증은 생성된 문서의 값이고 여기서 덧붙이지 않는다. */
function Spec({ endpoint }: { endpoint: Endpoint }) {
  const { api, spec } = endpoint;
  if (!spec) {
    return (
      <Row term="OpenAPI" empty="">
        <span className="typo-caption-small text-text-light">
          {api.exposure === 'non-production'
            ? '개발 환경 전용 route라 Swagger 문서에 없음'
            : 'Swagger 문서를 읽지 못함'}
        </span>
      </Row>
    );
  }
  return (
    <Row term="OpenAPI">
      <span className="typo-body-small">{spec.summary}</span>
      <span className="typo-caption-small text-text-light">
        {[...spec.tags, spec.secured ? 'Bearer 세션 필요' : '인증 없이 호출'].join(' · ')}
      </span>
      <Link href={sourceHref(swaggerDocument.path)} className={LINK}>
        swagger.json
      </Link>
    </Row>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const { api, steps, contracts, tests } = endpoint;
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <h3 className="devhub-code typo-body-small-strong">
        {api.method} {api.path}
        {api.alsoHead && <span className="text-text-light"> (+HEAD)</span>}
      </h3>
      <dl className="flex flex-col gap-1">
        <Spec endpoint={endpoint} />
        <Row term="handler">
          <Link href={sourceHref(api.handler.path)} className={`${LINK} devhub-code`}>
            {api.handler.symbol ?? api.handler.path}
          </Link>
          <span className="typo-caption-small text-text-light">{api.handler.path}</span>
        </Row>
        <Row term="호출 단계" empty="이 route를 인용한 시나리오 단계 없음">
          {steps.length > 0
            ? steps.map(({ scenario, step }) => (
                <span key={`${scenario.id}/${step.id}`} className="inline-flex flex-wrap gap-x-1">
                  <Link href={stepHref(scenario.id, step.id)} className={LINK}>
                    {step.intent}
                  </Link>
                  <span className="typo-caption-small text-text-light">· {scenario.title}</span>
                </span>
              ))
            : undefined}
        </Row>
        <Row term="계약" empty="호출 단계가 인용한 계약 없음">
          {contracts.length > 0
            ? contracts.map((contract) => (
                <Link
                  key={contract.id}
                  href={sourceHref(contract.definedIn.path)}
                  className={`${LINK} devhub-code`}
                >
                  {contract.name}
                </Link>
              ))
            : undefined}
        </Row>
        <Row term="테스트" empty="호출 단계가 인용한 테스트 없음">
          {tests.length > 0
            ? tests.map((test) => (
                <Link key={test.id} href={sourceHref(test.source.path)} className={LINK}>
                  {test.title?.join(' › ') ?? test.source.symbol ?? test.id}
                </Link>
              ))
            : undefined}
        </Row>
      </dl>
    </li>
  );
}

/**
 * 프로젝트가 제공하는 route 전부. 목록이 정본이고 route는 카탈로그 `apis`에서 온다. 명세는 Swagger,
 * 연결(호출 단계 · 계약 · 테스트)은 카탈로그가 맡는다.
 */
export function EndpointList({ endpoints }: { endpoints: Endpoint[] }) {
  return (
    <WorkspaceSection id="entity-endpoints" title={`API endpoint ${endpoints.length}개`}>
      <p className="typo-caption-small text-text-light">
        명세의 정본은 생성된 Swagger 문서. 여기서는 route마다 handler와 인용한 단계 · 계약 ·
        테스트로 이어진다
      </p>
      <ul className="flex flex-col divide-y divide-stroke-light">
        {endpoints.map((endpoint) => (
          <EndpointRow key={endpoint.api.id} endpoint={endpoint} />
        ))}
      </ul>
    </WorkspaceSection>
  );
}
