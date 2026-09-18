'use client';

import { Button } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { Icon } from '../icon';

type CanvasToolbarProps = {
  zoom: number;
  helpId: string;
  help: ReactNode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
};

export function CanvasToolbar({
  zoom,
  helpId,
  help,
  onZoomIn,
  onZoomOut,
  onFit,
}: CanvasToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p id={helpId} className="typo-caption-small text-text-light">
        배경을 끌어 이동 · Ctrl/⌘ + 휠로 확대 · 항목에 포커스한 채 방향키 이동, + − 확대, 0 맞추기.{' '}
        {help}
      </p>
      <div role="group" aria-label="보기 조절" className="flex items-center gap-1">
        <Button size="sm" variant="outlined" aria-label="축소" onClick={onZoomOut}>
          <Icon name="minus" />
        </Button>
        <output className="min-w-12 text-center typo-caption-small">
          {Math.round(zoom * 100)}%
        </output>
        <Button size="sm" variant="outlined" aria-label="확대" onClick={onZoomIn}>
          <Icon name="plus" />
        </Button>
        <Button size="sm" variant="outlined" onClick={onFit}>
          화면에 맞추기
        </Button>
      </div>
    </div>
  );
}
