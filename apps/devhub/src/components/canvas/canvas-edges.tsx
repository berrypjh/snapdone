export type CanvasEdge = {
  id: string;
  path: string;
  /** SVG dash pattern. Line pattern and label, not color, tell edge kinds apart. */
  dash?: string;
  label?: { x: number; y: number; text: string };
};

/**
 * Edges in the same coordinate space as the nodes. Decorative for assistive technology: every
 * canvas also lists its relations as text.
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
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
    >
      <defs>
        <marker
          id="canvas-arrow"
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
          markerEnd="url(#canvas-arrow)"
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
