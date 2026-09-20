'use client';

import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';

import { ARCH_NODE, type ArchNode } from '@/lib/catalog/architecture-layout';

import { INSPECTOR_ID } from '../shell/workspace';
import { Icon } from '../ui/icon';
import { NODE_KIND_ICON } from '../ui/view-icons';

type ArchitectureNodeProps = {
  node: ArchNode;
  selected: boolean;
  onFocus: (node: ArchNode) => void;
};

/**
 * 프로젝트 · 외부 시스템 하나를 아키텍처 URL로 가는 실제 링크로 그린다. 저장소 밖 시스템은 코드
 * 없는 단계처럼 점선이고, 선택된 구성 요소 뒤에는 인스펙터 상세로 가는 건너뛰기 링크가 붙는다.
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
          external ? 'border-dashed bg-background-default' : 'bg-background-surface',
          selected
            ? 'border-2 border-stroke-primary bg-[image:linear-gradient(var(--ds-background-selected),var(--ds-background-selected))]'
            : external
              ? 'border-stroke-default'
              : 'border-stroke-light',
        ].join(' ')}
      >
        <span className="flex items-center gap-1.5 typo-caption-small text-text-light">
          <Icon name={NODE_KIND_ICON[node.nodeKind]} />
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
