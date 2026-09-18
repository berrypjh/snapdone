'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';

import type { Rect, Size } from '@/lib/viewport';

import { CanvasToolbar } from './canvas-toolbar';
import { usePanZoom } from './use-pan-zoom';

type CanvasViewportProps = {
  /** Accessible name of the canvas region. */
  label: string;
  content: Size;
  /** Canvas-specific legend appended to the shared help text. */
  help: ReactNode;
  /** Visible one-line summary (counts and current selection), also read as the description. */
  summary: string;
  /** Content rect of the selected item; panned into view on load and when it changes. */
  selected?: Rect;
  /** Layer content; `reveal` pans a content rect into view (call it when a node gets focus). */
  children: (api: { reveal: (rect: Rect) => void }) => ReactNode;
};

/**
 * The one pan/zoom surface every DevHub canvas uses: toolbar, clipped viewport, and a single
 * transformed layer where DOM nodes and SVG edges share coordinates.
 */
export function CanvasViewport({
  label,
  content,
  help,
  summary,
  selected,
  children,
}: CanvasViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const summaryId = useId();
  const { view, fit, zoomIn, zoomOut, reveal, handlers } = usePanZoom(viewportRef, content);

  // A deep link can select a node the initial fit leaves off screen.
  const { x = null, y = null, width = 0, height = 0 } = selected ?? {};
  useEffect(() => {
    if (x !== null && y !== null) reveal({ x, y, width, height });
  }, [reveal, x, y, width, height]);

  return (
    <div className="flex flex-col gap-2">
      <CanvasToolbar
        zoom={view.k}
        helpId={helpId}
        help={help}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fit}
      />
      <p id={summaryId} className="typo-caption-small">
        {summary}
      </p>
      <div
        ref={viewportRef}
        role="group"
        aria-label={label}
        aria-describedby={`${summaryId} ${helpId}`}
        className="relative h-[min(60vh,34rem)] cursor-grab touch-none overflow-hidden rounded-lg border border-stroke-light bg-background-default devhub-grid active:cursor-grabbing"
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
  );
}
