'use client';

import { type ReactNode, useState } from 'react';

import { SegmentControl } from '@berrypjh/react-ui';

type Mode = 'canvas' | 'list';

const OPTIONS = [
  { value: 'canvas', label: '그림' },
  { value: 'list', label: '목록' },
] as const;

/**
 * Lets the reader choose the drawing or the structured list. Both carry the same information;
 * only the chosen one is rendered, so the canvas refits when it comes back.
 */
export function ViewSwitch({
  label,
  canvas,
  list,
}: {
  label: string;
  canvas: ReactNode;
  list: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>('canvas');
  return (
    <div className="flex flex-col gap-3">
      <SegmentControl
        aria-label={`${label} 보기 방식`}
        value={mode}
        onChange={setMode}
        options={OPTIONS}
        className="max-w-48"
      />
      {mode === 'canvas' ? canvas : list}
    </div>
  );
}
