import Link from 'next/link';

import { WorkspaceSection } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { architectureHref } from '@/lib/catalog/architecture';
import { stepHref } from '@/lib/catalog/entities';
import { INTERACTION, RELATION } from '@/lib/catalog/labels';
import type { SourceUsage } from '@/lib/repository/source-usage';

const LINK = 'typo-body-small text-text-link underline-offset-2 hover:underline';

function Group({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <WorkspaceSection id={id} title={`${title} ${count}`}>
      {count > 0 ? children : <p className="typo-caption-small text-text-light">없음</p>}
    </WorkspaceSection>
  );
}

/** 인용된 파일이 어디에 쓰였는지 목록으로. 저장소 링크는 인스펙터에 있다. */
export function SourceUsageSummary({ usage }: { usage: SourceUsage }) {
  return (
    <>
      <Group id="source-steps" title="인용한 시나리오 단계" count={usage.steps.length}>
        <ul className="flex flex-col gap-1">
          {usage.steps.map(({ scenario, step }) => (
            <li key={`${scenario.id}/${step.id}`}>
              <Link href={stepHref(scenario.id, step.id)} className={LINK}>
                {step.intent}
              </Link>
              <span className="typo-caption-small text-text-light"> · {scenario.title}</span>
            </li>
          ))}
        </ul>
      </Group>
      <Group id="source-apis" title="이 파일의 API" count={usage.apis.length}>
        <ul className="flex flex-col gap-1">
          {usage.apis.map((api) => (
            <li key={api.id} className="devhub-code">
              {api.method} {api.path} · {api.handler.symbol}
            </li>
          ))}
        </ul>
      </Group>
      <Group id="source-contracts" title="이 파일의 계약" count={usage.contracts.length}>
        <ul className="flex flex-col gap-1">
          {usage.contracts.map((contract) => (
            <li key={contract.id} className="typo-body-small">
              {contract.name} <span className="text-text-light">· {contract.kind}</span>
            </li>
          ))}
        </ul>
      </Group>
      <Group id="source-tests" title="이 파일의 테스트" count={usage.tests.length}>
        <ul className="flex flex-col gap-1">
          {usage.tests.map((test) => (
            <li key={test.id} className="typo-body-small">
              {test.title?.join(' › ') ?? test.source.symbol}
            </li>
          ))}
        </ul>
      </Group>
      <Group
        id="source-relations"
        title="근거로 쓴 관계 · 구성 요소"
        count={usage.relations.length + usage.nodes.length}
      >
        <ul className="flex flex-col gap-1">
          {usage.relations.map((relation) => (
            <li key={relation.id} className="typo-body-small">
              <Link href={architectureHref(relation.from)} className={LINK}>
                {relation.from}
              </Link>{' '}
              →{' '}
              <Link href={architectureHref(relation.to)} className={LINK}>
                {relation.to}
              </Link>
              <span className="text-text-light">
                {' '}
                ·{' '}
                {relation.kind === 'runtime'
                  ? INTERACTION[relation.interaction]
                  : RELATION[relation.kind]}
              </span>
            </li>
          ))}
          {usage.nodes.map((node) => (
            <li key={node.id}>
              <Link href={architectureHref(node.id)} className={LINK}>
                {node.id}
              </Link>
            </li>
          ))}
        </ul>
      </Group>
    </>
  );
}
