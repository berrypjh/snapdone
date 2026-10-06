'use client';

import Link from 'next/link';

import { INSPECTOR_ID } from '@berrypjh/devhub-ui';
import { SkipLink } from '@berrypjh/react-ui';

import type { FlowNode as FlowNodeModel } from '@/lib/catalog/flow';
import { NODE } from '@/lib/catalog/flow';

import { StatusChip } from '../entity/status-chip';

type FlowNodeProps = {
  node: FlowNodeModel;
  selected: boolean;
  onFocus: (node: FlowNodeModel) => void;
};

const counts = (node: FlowNodeModel) =>
  [
    node.apiCount && `API ${node.apiCount}`,
    node.contractCount && `계약 ${node.contractCount}`,
    `테스트 ${node.testCount}`,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * 단계 하나를 딥링크 URL로 가는 실제 링크로. 포커스와 Enter가 되고, 글이 잘려도 접근성 이름에는
 * 의도가 그대로 남는다. 선택된 단계 뒤에는 인스펙터 상세로 가는 건너뛰기 링크가 붙는다.
 */
export function FlowNode({ node, selected, onFocus }: FlowNodeProps) {
  const noCode =
    node.status === 'documented-only' || node.status === 'not-found' || node.status === 'planned';
  return (
    <li
      className="absolute"
      style={{ left: node.x, top: node.y, width: NODE.width, height: NODE.height }}
    >
      <Link
        href={node.href}
        scroll={false}
        aria-current={selected ? 'page' : undefined}
        onFocus={() => onFocus(node)}
        className={[
          'flex h-full flex-col gap-1 rounded-lg border bg-background-surface p-3 text-text-default shadow-xs hover:border-stroke-dark',
          noCode ? 'border-dashed border-stroke-default' : 'border-stroke-light',
          selected
            ? 'border-2 border-stroke-primary bg-[image:linear-gradient(var(--ds-background-selected),var(--ds-background-selected))]'
            : '',
        ].join(' ')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="typo-caption-small text-text-light">
            {node.order}. {node.runtime}
          </span>
          <StatusChip status={node.status} />
        </span>
        <span className="line-clamp-2 typo-body-small-strong">{node.intent}</span>
        <span className="typo-caption-small text-text-light">
          담당 {node.owner}
          {selected && (
            <span aria-hidden="true" className="typo-body-small-strong text-text-default">
              {' '}
              · 선택됨
            </span>
          )}
        </span>
        <span className="devhub-code truncate text-text-light">
          {node.source ?? '소스 없음'}
          {node.sourceCount > 1 && ` +${node.sourceCount - 1}`}
        </span>
        <span className="typo-caption-small text-text-light">
          {counts(node)}
          {node.via.length > 0 && ` · 경유 ${node.via.join(', ')}`}
        </span>
      </Link>
      {selected && <SkipLink targetId={INSPECTOR_ID}>이 단계의 상세 정보로 이동</SkipLink>}
    </li>
  );
}
