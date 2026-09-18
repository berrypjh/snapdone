import type { FlowLane } from '@/lib/flow';

/** Runtime bands behind the nodes. Every node also names its runtime, so these are decorative. */
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
