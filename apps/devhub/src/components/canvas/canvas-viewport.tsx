'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@berrypjh/react-ui';

import type { Rect, Size } from '@/lib/viewport';

import { Icon } from '../icon';

import { CanvasControls, CanvasHelp, type LegendItem } from './canvas-toolbar';
import { usePanZoom } from './use-pan-zoom';

type CanvasViewportProps = {
  /** Accessible name of the canvas region. */
  label: string;
  content: Size;
  /** What the canvas's line and box styles mean, shown with samples under "도움말". */
  legend: LegendItem[];
  /** Visible one-line summary (counts and current selection), also read as the description. */
  summary: string;
  /** Content rect of the selected item; panned into view on load and when it changes. */
  selected?: Rect;
  /** Layer content; `reveal` pans a content rect into view (call it when a node gets focus). */
  children: (api: { reveal: (rect: Rect) => void }) => ReactNode;
};

type SurfaceProps = CanvasViewportProps & {
  /** Size of the clipped viewport. */
  viewportClassName: string;
  onExpand?: () => void;
};

/**
 * Summary and "도움말" above the canvas; the clipped viewport with one transformed layer, and the
 * zoom controls floating in its corner. The controls come first in the page, so the keyboard
 * reaches them before the canvas's items.
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

  // A deep link can select a node the initial fit leaves off screen.
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

/** Opens the dialog as a modal unless it already is — safe to call twice. */
export const openModal = (dialog: Pick<HTMLDialogElement, 'open' | 'showModal'> | null) => {
  if (dialog && !dialog.open) dialog.showModal();
};

/**
 * "크게 보기": the same canvas in a modal `<dialog>` that fills the window. Native modal behavior
 * does the rest — Escape closes, the page behind is inert, focus returns to the button. The
 * surface mounts only once the dialog is open, so it fits the full size.
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

  // No close() on cleanup: in development React runs this effect twice, and close() queues a
  // `close` event that would arrive after the reopen and unmount the dialog at once. Removing an
  // open dialog from the page already takes it off the top layer.
  useEffect(() => {
    openModal(dialogRef.current);
    setOpen(true);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // A link to a place on the page (the inspector) closes the dialog first, so it can land.
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
 * The one pan/zoom surface every DevHub canvas uses, with "크게 보기" to open the same canvas at
 * the window's size.
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
