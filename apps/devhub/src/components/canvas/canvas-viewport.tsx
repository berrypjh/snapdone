'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@berrypjh/react-ui';

import type { Rect, Size } from '@/lib/browser/viewport';

import { Icon } from '../ui/icon';

import { CanvasControls, CanvasHelp, type LegendItem } from './canvas-toolbar';
import { usePanZoom } from './use-pan-zoom';

type CanvasViewportProps = {
  /** 그림 영역의 접근성 이름. */
  label: string;
  content: Size;
  /** 그림의 선 · 상자 모양이 뜻하는 것. "도움말" 아래에 견본과 함께 보인다. */
  legend: LegendItem[];
  /** 화면에 보이는 한 줄 요약(개수와 현재 선택). 설명으로도 읽힌다. */
  summary: string;
  /** 선택된 항목의 content 좌표. 처음 그릴 때와 바뀔 때 화면 안으로 이동한다. */
  selected?: Rect;
  /** 레이어 내용. `reveal`은 content 좌표를 화면 안으로 옮긴다(노드가 포커스를 받을 때 호출). */
  children: (api: { reveal: (rect: Rect) => void }) => ReactNode;
};

type SurfaceProps = CanvasViewportProps & {
  /** 잘린 viewport의 크기. */
  viewportClassName: string;
  onExpand?: () => void;
};

/**
 * 그림 위의 요약과 "도움말", 변환 레이어 하나를 담은 잘린 viewport, 구석에 떠 있는 확대 조절.
 * 조절이 페이지에서 먼저 나오므로 키보드가 그림 속 항목보다 먼저 닿는다.
 */
function CanvasSurface({
  label,
  content,
  legend,
  summary,
  selected,
  children,
  viewportClassName,
  onExpand,
}: SurfaceProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const summaryId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const { view, fit, zoomIn, zoomOut, reveal, handlers } = usePanZoom(viewportRef, content);

  // 딥링크로 들어오면 처음 맞춘 화면 밖에 있는 노드가 선택될 수 있다.
  const { x = null, y = null, width = 0, height = 0 } = selected ?? {};
  useEffect(() => {
    if (x !== null && y !== null) reveal({ x, y, width, height });
  }, [reveal, x, y, width, height]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={summaryId} className="typo-caption-small">
          {summary}
        </p>
        <Button
          size="sm"
          variant="text"
          color="secondary"
          aria-expanded={helpOpen}
          aria-controls={helpId}
          onClick={() => setHelpOpen((current) => !current)}
        >
          <span className="inline-flex items-center gap-1">
            <Icon name="help" />
            도움말
          </span>
        </Button>
      </div>
      <CanvasHelp id={helpId} open={helpOpen} legend={legend} />
      <div className={`relative ${viewportClassName}`}>
        <CanvasControls
          zoom={view.k}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFit={fit}
          onExpand={onExpand}
        />
        <div
          ref={viewportRef}
          role="group"
          aria-label={label}
          aria-describedby={`${summaryId} ${helpId}`}
          className="relative h-full cursor-grab touch-none overflow-hidden rounded-lg border border-stroke-light bg-background-default devhub-grid active:cursor-grabbing"
          {...handlers}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: content.width,
              height: content.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            }}
          >
            {children({ reveal })}
          </div>
        </div>
      </div>
    </>
  );
}

/** 이미 모달이 아니면 모달로 연다. 두 번 불러도 안전하다. */
export const openModal = (dialog: Pick<HTMLDialogElement, 'open' | 'showModal'> | null) => {
  if (dialog && !dialog.open) dialog.showModal();
};

/**
 * "크게 보기": 같은 그림을 창을 채우는 모달 `<dialog>`에 담는다. Escape로 닫기 · 뒤 페이지 비활성
 * · 버튼으로 포커스 복귀는 모달 기본 동작이 한다. dialog가 열린 뒤에 그려야 전체 크기에 맞는다.
 */
function CanvasDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  // cleanup에서 close()를 부르지 않는다. 개발 모드에서 effect가 두 번 돌면 `close` 이벤트가 다시
  // 연 뒤에 도착해 dialog를 곧바로 내린다. 열린 dialog를 페이지에서 지우면 top layer에서도 빠진다.
  useEffect(() => {
    openModal(dialogRef.current);
    setOpen(true);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // 페이지 안(상세 정보)으로 가는 링크는 dialog를 먼저 닫아야 도착할 수 있다.
      onClickCapture={(event) => {
        if ((event.target as Element).closest('a[href^="#"]')) dialogRef.current?.close();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-background-surface p-4 text-text-default backdrop:bg-neutral-ne900/50 sm:p-6"
    >
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="typo-body-medium-strong">
            {title}
          </h2>
          <Button size="sm" variant="outlined" onClick={() => dialogRef.current?.close()}>
            <span className="inline-flex items-center gap-1">
              <Icon name="close" />
              닫기
            </span>
          </Button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

/**
 * DevHub의 모든 그림이 쓰는 이동 · 확대 영역. "크게 보기"로 같은 그림을 창 크기로 연다.
 */
export function CanvasViewport(props: CanvasViewportProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <CanvasSurface
        {...props}
        viewportClassName="h-[min(60vh,34rem)]"
        onExpand={() => setExpanded(true)}
      />
      {expanded && (
        <CanvasDialog title={`${props.label} — 크게 보기`} onClose={() => setExpanded(false)}>
          <CanvasSurface {...props} viewportClassName="min-h-0 flex-1" />
        </CanvasDialog>
      )}
    </div>
  );
}
