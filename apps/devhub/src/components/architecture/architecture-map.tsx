'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

import type { Relation } from '@/domain/model';
import { ARCH_NODE, type ArchitectureModel, filterModel } from '@/lib/catalog/architecture-layout';

import { CanvasEdges } from '../canvas/canvas-edges';
import type { LegendItem } from '../canvas/canvas-toolbar';
import { CanvasViewport } from '../canvas/canvas-viewport';

import { ArchitectureNode } from './architecture-node';

/** 관계 종류별 선 모양. 모든 간선은 글자 라벨도 함께 가진다. */
const DASH: Record<Relation['kind'], string | undefined> = {
  'workspace-dependency': '2 4',
  runtime: undefined,
  verification: '8 3 2 3',
};

const AUTH_REDIRECT_DASH = '6 4';

/** 간선과 같은 선 모양에서 만들기 때문에 범례가 그림과 어긋날 수 없다. */
const LEGEND: LegendItem[] = [
  { box: 'solid', label: '저장소 안 프로젝트' },
  { box: 'dashed', label: '저장소 밖 시스템' },
  { line: DASH.runtime ?? null, label: '실행 중 호출' },
  { line: DASH['workspace-dependency'] ?? null, label: 'Nx 의존' },
  { line: AUTH_REDIRECT_DASH, label: '인증 redirect' },
  { line: DASH.verification ?? null, label: '검증' },
];

type ArchitectureMapProps = {
  model: ArchitectureModel;
  /** 이 종류의 구성 요소와 그 사이 간선만 보인다. */
  kind?: string;
  /** 현재 필터 쿼리. 구성 요소 링크에 붙여 두어 선택해도 필터가 유지된다. */
  query?: string;
};

/** 필터 결과가 비었을 때 그림과 목록이 함께 쓰는 빈 상태. */
export function NoNodes() {
  return (
    <p
      role="status"
      className="rounded-lg border border-dashed border-stroke-default p-6 typo-body-small"
    >
      조건에 맞는 구성 요소가 없습니다. 필터를 &lsquo;전체&rsquo;로 바꿔 주세요.
    </p>
  );
}

/** 공용 캔버스에 그리는 현재 아키텍처. URL의 구성 요소가 선택이다. */
export function ArchitectureMap({ model, kind, query = '' }: ArchitectureMapProps) {
  const selected = useSelectedLayoutSegment();
  const { nodes, edges: kept } = filterModel(model, kind);
  const edges = kept.map((edge) => ({
    id: edge.id,
    path: edge.path,
    dash: edge.interaction === 'auth-redirect' ? AUTH_REDIRECT_DASH : DASH[edge.kind],
    label: { ...edge.label, text: edge.text },
  }));

  const current = nodes.find((node) => node.id === selected);
  const summary = `구성 요소 ${nodes.length}개 · 관계 ${edges.length}개 · 선택: ${
    current ? current.label : '없음'
  }`;

  if (nodes.length === 0) return <NoNodes />;

  return (
    <CanvasViewport
      label="현재 아키텍처 그림"
      content={{ width: model.width, height: model.height }}
      legend={LEGEND}
      summary={summary}
      selected={current && { x: current.x, y: current.y, ...ARCH_NODE }}
    >
      {({ reveal }) => (
        <>
          <CanvasEdges edges={edges} width={model.width} height={model.height} />
          <ol aria-label="구성 요소" className="absolute top-0 left-0">
            {nodes.map((node) => (
              <ArchitectureNode
                key={node.id}
                node={{ ...node, href: query ? `${node.href}?${query}` : node.href }}
                selected={node.id === selected}
                onFocus={(focused) =>
                  reveal({
                    x: focused.x,
                    y: focused.y,
                    width: ARCH_NODE.width,
                    height: ARCH_NODE.height,
                  })
                }
              />
            ))}
          </ol>
        </>
      )}
    </CanvasViewport>
  );
}
