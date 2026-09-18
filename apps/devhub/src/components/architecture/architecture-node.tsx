'use client';

import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';

import { ARCH_NODE, type ArchNode } from '@/lib/architecture-layout';

import { INSPECTOR_ID } from '../workspace';

type ArchitectureNodeProps = {
  node: ArchNode;
  selected: boolean;
  onFocus: (node: ArchNode) => void;
};

/**
 * One project or external system as a real link to its architecture URL. The selected node is
 * followed by a skip link to its details in the inspector.
 */
export function ArchitectureNode({ node, selected, onFocus }: ArchitectureNodeProps) {
  const external = node.kind === '외부';
  return (
    <li
      className="absolute"
      style={{ left: node.x, top: node.y, width: ARCH_NODE.width, height: ARCH_NODE.height }}
    >
      <Link
        href={node.href}
        scroll={false}
        aria-current={selected ? 'page' : undefined}
        onFocus={() => onFocus(node)}
        className={[
          'flex h-full flex-col gap-1 rounded-lg border p-3 text-text-default shadow-xs hover:border-stroke-dark',
          external ? 'bg-background-default' : 'bg-background-surface',
          selected
            ? 'border-2 border-stroke-primary bg-[image:linear-gradient(var(--ds-background-selected),var(--ds-background-selected))]'
            : 'border-stroke-light',
        ].join(' ')}
      >
        <span className="typo-caption-small text-text-light">
          {node.kind}
          {selected && (
            <span aria-hidden="true" className="typo-body-small-strong text-text-default">
              {' '}
              · 선택됨
            </span>
          )}
        </span>
        <span className="typo-body-small-strong">{node.label}</span>
        <span className="devhub-code truncate text-text-light">{node.detail}</span>
        <span className="line-clamp-2 typo-caption-small text-text-light">{node.summary}</span>
      </Link>
      {selected && <SkipLink targetId={INSPECTOR_ID}>이 구성 요소의 상세 정보로 이동</SkipLink>}
    </li>
  );
}
