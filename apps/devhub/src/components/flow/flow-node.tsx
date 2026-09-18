'use client';

import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';

import type { FlowNode as FlowNodeModel } from '@/lib/flow';
import { NODE } from '@/lib/flow';

import { StatusChip } from '../status-chip';
import { INSPECTOR_ID } from '../workspace';

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
 * One step as a real link to its deep-link URL: focusable, activatable with Enter, and the
 * full intent stays in the accessible name even when the visual text is clamped. The selected
 * step is followed by a skip link, so one Tab reaches its details in the inspector.
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
