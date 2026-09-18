'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

import type { FlowModel } from '@/lib/flow';
import { NODE } from '@/lib/flow';

import { CanvasEdges } from '../canvas/canvas-edges';
import { CanvasViewport } from '../canvas/canvas-viewport';

import { FlowLanes } from './flow-lanes';
import { FlowNode } from './flow-node';

/** The step selected by the URL (`…/steps/<id>`) below the scenario layout. */
const useSelectedStep = () => {
  const segments = useSelectedLayoutSegments();
  return segments[0] === 'steps' ? segments[1] : undefined;
};

/**
 * Read-only scenario flow on the shared canvas. Selecting a node navigates to its step URL; the
 * inspector is rendered from that route, not from here.
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
    dash: edge.back ? '6 4' : undefined,
  }));

  return (
    <CanvasViewport
      label={`${title} 흐름 그림`}
      content={{ width: model.width, height: model.height }}
      help="점선 테두리는 코드가 없는 단계, 점선 화살표는 앞 단계로 돌아가는 흐름입니다."
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
