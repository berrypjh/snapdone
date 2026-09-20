import type { FlowLane } from '@/lib/catalog/flow';

/** 단계 뒤에 깔리는 런타임 띠. 단계마다 런타임을 글로도 적으므로 장식이다. */
export function FlowLanes({ lanes, width }: { lanes: FlowLane[]; width: number }) {
  return (
    <div aria-hidden="true" className="absolute top-0 left-0" style={{ width }}>
      {lanes.map((lane, index) => (
        <div
          key={lane.id}
          className={[
            'absolute left-0 border-b border-stroke-light',
            index % 2 === 0 ? 'bg-background-surface/60' : '',
          ].join(' ')}
          style={{ top: lane.y, height: lane.height, width }}
        >
          <span className="absolute top-3 left-3 typo-caption-small text-text-light">
            {lane.name}
          </span>
        </div>
      ))}
    </div>
  );
}
