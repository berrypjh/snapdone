import { useId } from 'react';

export type CanvasEdge = {
  id: string;
  path: string;
  /** SVG dash 패턴. 선의 종류는 색이 아니라 패턴과 라벨로 구분한다. */
  dash?: string;
  label?: { x: number; y: number; text: string };
};

/**
 * 노드와 같은 좌표계에 그리는 연결선. 보조 기술에는 장식이다. 모든 그림은 관계를 글로도 나열한다.
 */
export function CanvasEdges({
  edges,
  width,
  height,
}: {
  edges: CanvasEdge[];
  width: number;
  height: number;
}) {
  // 인스턴스마다 하나씩. 같은 그림이 페이지와 "크게 보기"에 두 번 그려질 수 있다.
  const markerId = useId();
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ds-stroke-dark)" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.path}
          fill="none"
          stroke="var(--ds-stroke-dark)"
          strokeWidth={1.5}
          strokeDasharray={edge.dash}
          markerEnd={`url(#${markerId})`}
        />
      ))}
      {edges.map(
        (edge) =>
          edge.label && (
            <text
              key={`${edge.id}-label`}
              x={edge.label.x}
              y={edge.label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--ds-text-light)"
              stroke="var(--ds-background-default)"
              strokeWidth={4}
              paintOrder="stroke"
              fontSize={12}
            >
              {edge.label.text}
            </text>
          ),
      )}
    </svg>
  );
}
