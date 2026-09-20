'use client';

import { type ReactNode, useState } from 'react';

import { SegmentControl } from '@berrypjh/react-ui';

type Mode = 'canvas' | 'list';

const OPTIONS = [
  { value: 'canvas', label: '그림' },
  { value: 'list', label: '목록' },
] as const;

/**
 * 읽는 사람이 그림과 목록 중에 고른다. 둘은 같은 정보를 담고, 고른 쪽만 그리므로 그림은 돌아올 때
 * 다시 화면에 맞춘다. `tools`(필터)는 같은 줄 왼쪽에 놓인다.
 */
export function ViewSwitch({
  label,
  canvas,
  list,
  tools,
}: {
  label: string;
  canvas: ReactNode;
  list: ReactNode;
  tools?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>('canvas');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tools}
        <SegmentControl
          aria-label={`${label} 보기 방식`}
          value={mode}
          onChange={setMode}
          options={OPTIONS}
          className="max-w-48"
        />
      </div>
      {mode === 'canvas' ? canvas : list}
    </div>
  );
}
