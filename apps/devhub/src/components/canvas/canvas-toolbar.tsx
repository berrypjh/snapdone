'use client';

import { Button } from '@berrypjh/react-ui';

import { Icon, type IconName } from '../ui/icon';

/** 범례 항목 하나. 선 모양(dash 패턴, 실선이면 `null`)이거나 노드 상자다. */
export type LegendItem = { label: string } & (
  { line: string | null } | { box: 'solid' | 'dashed' }
);

function Sample({ item }: { item: LegendItem }) {
  return (
    <svg aria-hidden="true" width="28" height="14" className="shrink-0 overflow-visible">
      {'line' in item ? (
        <line
          x1="0"
          y1="7"
          x2="28"
          y2="7"
          stroke="var(--ds-stroke-dark)"
          strokeWidth="1.5"
          strokeDasharray={item.line ?? undefined}
        />
      ) : (
        <rect
          x="4"
          y="1"
          width="20"
          height="12"
          rx="2"
          fill="var(--ds-background-surface)"
          stroke="var(--ds-stroke-default)"
          strokeDasharray={item.box === 'dashed' ? '3 2' : undefined}
        />
      )}
    </svg>
  );
}

const KEYS: [keys: string[], action: string][] = [
  [['끌기'], '배경을 끌어 이동'],
  [['Ctrl', '휠'], '확대 · 축소 (macOS는 ⌘)'],
  [['←', '↑', '→', '↓'], '항목에 포커스한 채 이동'],
  [['+', '−'], '확대 · 축소'],
  [['0'], '화면에 맞추기'],
];

/**
 * 조작법과 선의 뜻을 "도움말" 뒤에 접어 둔다. 펼치기 전에도 그림의 설명이다
 * (`aria-describedby`는 숨긴 내용도 읽는다).
 */
export function CanvasHelp({
  id,
  open,
  legend,
}: {
  id: string;
  open: boolean;
  legend: LegendItem[];
}) {
  return (
    <div
      id={id}
      hidden={!open}
      className="grid gap-4 rounded-md border border-stroke-light bg-background-surface p-3 sm:grid-cols-2"
    >
      <div className="flex flex-col gap-2">
        <p className="typo-caption-small text-text-light">조작</p>
        <ul className="flex flex-col gap-1 typo-caption-small">
          {KEYS.map(([keys, action]) => (
            <li key={action} className="flex items-center gap-2">
              <span className="flex shrink-0 gap-0.5">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-sm border border-stroke-light bg-background-default px-1 font-mono"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              {action}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="typo-caption-small text-text-light">범례</p>
        <ul className="flex flex-col gap-1 typo-caption-small">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <Sample item={item} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="text"
      color="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </Button>
  );
}

type CanvasControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** 그림을 창 크기로 연다. 그 확대 보기 안에서는 없다. */
  onExpand?: () => void;
};

/** 지도 도구처럼 그림 오른쪽 아래에 떠 있는 확대 · 보기 조절. */
export function CanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onExpand,
}: CanvasControlsProps) {
  return (
    <div
      role="group"
      aria-label="보기 조절"
      className="absolute right-3 bottom-3 z-10 flex items-center divide-x divide-stroke-light rounded-md border border-stroke-light bg-background-surface shadow-xs"
    >
      <div className="flex items-center">
        <ControlButton label="축소" icon="minus" onClick={onZoomOut} />
        <output className="min-w-11 text-center typo-caption-small">
          {Math.round(zoom * 100)}%
        </output>
        <ControlButton label="확대" icon="plus" onClick={onZoomIn} />
      </div>
      <ControlButton label="화면에 맞추기" icon="fit" onClick={onFit} />
      {onExpand && <ControlButton label="크게 보기" icon="expand" onClick={onExpand} />}
    </div>
  );
}
