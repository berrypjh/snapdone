'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

import type { FlowModel } from '@/lib/flow';
import { NODE } from '@/lib/flow';

import { CanvasEdges } from '../canvas/canvas-edges';
import type { LegendItem } from '../canvas/canvas-toolbar';
import { CanvasViewport } from '../canvas/canvas-viewport';

import { FlowLanes } from './flow-lanes';
import { FlowNode } from './flow-node';

const BACK_DASH = '6 4';

const LEGEND: LegendItem[] = [
  { box: 'solid', label: '코드가 있는 단계' },
  { box: 'dashed', label: '코드가 없는 단계' },
  { line: null, label: '다음 단계로' },
  { line: BACK_DASH, label: '앞 단계로 돌아가는 흐름' },
];

/** 시나리오 레이아웃 아래에서 URL(`…/steps/<id>`)이 가리키는 선택된 단계. */
const useSelectedStep = () => {
  const segments = useSelectedLayoutSegments();
  return segments[0] === 'steps' ? segments[1] : undefined;
};

/**
 * 공용 캔버스에 그리는 읽기 전용 시나리오 흐름. 단계를 고르면 그 단계 URL로 이동하고,
 * 인스펙터는 여기가 아니라 그 route에서 그린다.
 */
export function ScenarioFlow({ model, title }: { model: FlowModel; title: string }) {
  const selected = useSelectedStep();
  const current = model.nodes.find((node) => node.id === selected);
  const summary = `단계 ${model.nodes.length}개 · 연결 ${model.edges.length}개 · 선택: ${
    current ? `${current.order}. ${current.intent}` : '없음'
  }`;
  const edges = model.edges.map((edge) => ({
    id: edge.id,
    path: edge.path,
    dash: edge.back ? BACK_DASH : undefined,
  }));

  return (
    <CanvasViewport
      label={`${title} 흐름 그림`}
      content={{ width: model.width, height: model.height }}
      legend={LEGEND}
      summary={summary}
      selected={current && { x: current.x, y: current.y, ...NODE }}
    >
      {({ reveal }) => (
        <>
          <FlowLanes lanes={model.lanes} width={model.width} />
          <CanvasEdges edges={edges} width={model.width} height={model.height} />
          <ol aria-label="단계" className="absolute top-0 left-0">
            {model.nodes.map((node) => (
              <FlowNode
                key={node.id}
                node={node}
                selected={node.id === selected}
                onFocus={(focused) =>
                  reveal({ x: focused.x, y: focused.y, width: NODE.width, height: NODE.height })
                }
              />
            ))}
          </ol>
        </>
      )}
    </CanvasViewport>
  );
}
