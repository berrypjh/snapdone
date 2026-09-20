'use client';

import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  fitView,
  panBy,
  type Rect,
  revealRect,
  type Size,
  type View,
  zoomAt,
} from '@/lib/viewport';

const STEP = 48;
const ZOOM_STEP = 1.2;

const sizeOf = (element: HTMLElement): Size => ({
  width: element.clientWidth,
  height: element.clientHeight,
});

/**
 * 그림 하나의 보기 상태. 배경을 끌거나 화살표 키로 이동, Ctrl/⌘ + 휠이나 +/−로 확대, 0으로 맞춤.
 * transition이 없으므로 움직임 줄이기 설정은 기본으로 지켜진다.
 */
export function usePanZoom(viewportRef: RefObject<HTMLDivElement | null>, content: Size) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const { width, height } = content;
  // 객체가 아니라 숫자에 의존한다. 부모가 다시 그려도 사용자가 옮긴 위치가 초기화되지 않는다.
  const fit = useCallback(() => {
    if (viewportRef.current) setView(fitView({ width, height }, sizeOf(viewportRef.current)));
  }, [viewportRef, width, height]);

  const zoomBy = useCallback(
    (factor: number) => {
      const element = viewportRef.current;
      if (!element) return;
      const { width, height } = sizeOf(element);
      setView((current) => zoomAt(current, factor, width / 2, height / 2));
    },
    [viewportRef],
  );

  /** content 좌표를 화면 안으로 옮긴다. 예를 들어 화면 밖 노드가 키보드 포커스를 받을 때. */
  const reveal = useCallback(
    (rect: Rect) => {
      const element = viewportRef.current;
      if (!element) return;
      const viewport = sizeOf(element);
      setView((current) => revealRect(current, rect, viewport));
    },
    [viewportRef],
  );

  useLayoutEffect(fit, [fit]);

  // 휠은 non-passive listener여야 그림 아래에서 페이지가 스크롤되지 않는다.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      setView((current) =>
        event.ctrlKey || event.metaKey
          ? zoomAt(
              current,
              Math.exp(-event.deltaY * 0.01),
              event.clientX - box.left,
              event.clientY - box.top,
            )
          : panBy(current, -event.deltaX, -event.deltaY),
      );
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [viewportRef]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('a, button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = { ...start, x: event.clientX, y: event.clientY };
    setView((current) => panBy(current, event.clientX - start.x, event.clientY - start.y));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [STEP, 0],
      ArrowRight: [-STEP, 0],
      ArrowUp: [0, STEP],
      ArrowDown: [0, -STEP],
    };
    const move = moves[event.key];
    if (move) setView((current) => panBy(current, move[0], move[1]));
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-') zoomBy(1 / ZOOM_STEP);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  };

  return {
    view,
    fit,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    reveal,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
    },
  };
}
