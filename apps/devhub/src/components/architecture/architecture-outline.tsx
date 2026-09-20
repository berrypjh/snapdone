'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

import {
  type ArchEdge,
  type ArchitectureModel,
  type ArchNode,
  filterModel,
} from '@/lib/catalog/architecture-layout';

import { Icon } from '../ui/icon';
import { Term } from '../ui/term';
import { NODE_KIND_ICON } from '../ui/view-icons';

import { NoNodes } from './architecture-map';

const LINK = 'text-text-link underline-offset-2 hover:underline';

/** 각 관계의 반대쪽 구성 요소를 링크로. 관계 이름은 간선 라벨과 같게 적는다. */
function Relations({
  list,
  end,
  nodes,
  hrefOf,
}: {
  list: ArchEdge[];
  end: 'from' | 'to';
  nodes: Map<string, ArchNode>;
  hrefOf: (href: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {list.map((edge) => {
        const other = nodes.get(edge[end]);
        return (
          <li key={edge.id}>
            {other && (
              <Link href={hrefOf(other.href)} scroll={false} className={LINK}>
                {other.label}
              </Link>
            )}
            <span className="text-text-light"> · {edge.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 아키텍처 그림을 목록으로. 구성 요소마다 종류 · 경로 · 요약을 적고, 그려진 관계는 나가는 것과
 * 들어오는 것으로 나눠 반대쪽 구성 요소 링크와 간선과 같은 관계 이름을 보인다.
 */
export function ArchitectureOutline({
  model,
  kind,
  query = '',
}: {
  model: ArchitectureModel;
  kind?: string;
  query?: string;
}) {
  const selected = useSelectedLayoutSegment();
  const { nodes, edges } = filterModel(model, kind);
  if (nodes.length === 0) return <NoNodes />;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hrefOf = (href: string) => (query ? `${href}?${query}` : href);

  return (
    <ul aria-label="구성 요소" className="flex flex-col divide-y divide-stroke-light">
      {nodes.map((node) => {
        const outgoing = edges.filter((edge) => edge.from === node.id);
        const incoming = edges.filter((edge) => edge.to === node.id);
        return (
          <li key={node.id}>
            <article aria-labelledby={`outline-${node.id}`} className="flex flex-col gap-3 py-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 id={`outline-${node.id}`} className="typo-body-small-strong">
                    <Link
                      href={hrefOf(node.href)}
                      scroll={false}
                      aria-current={node.id === selected ? 'page' : undefined}
                      className={LINK}
                    >
                      {node.label}
                    </Link>
                    {node.id === selected && <span className="typo-caption-small"> · 선택됨</span>}
                  </h3>
                  <span className="flex shrink-0 items-center gap-1.5 typo-caption-small text-text-light">
                    <Icon name={NODE_KIND_ICON[node.nodeKind]} />
                    {node.kind}
                  </span>
                </div>
                <p className="devhub-code text-text-light">{node.detail}</p>
                <p className="typo-body-small">{node.summary}</p>
              </div>
              <dl className="flex flex-col gap-3">
                {outgoing.length > 0 && (
                  <Term icon="outgoing" term="나가는 관계" count={String(outgoing.length)}>
                    <Relations list={outgoing} end="to" nodes={byId} hrefOf={hrefOf} />
                  </Term>
                )}
                {incoming.length > 0 && (
                  <Term icon="incoming" term="들어오는 관계" count={String(incoming.length)}>
                    <Relations list={incoming} end="from" nodes={byId} hrefOf={hrefOf} />
                  </Term>
                )}
                {outgoing.length + incoming.length === 0 && (
                  <Term icon="related" term="관계">
                    <span className="text-text-light">없음</span>
                  </Term>
                )}
              </dl>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
