/**
 * 흐름 뷰어의 이동 · 확대 계산. 순수 함수이고 screen = content × k + (x, y)이다.
 * 뷰어 상태는 여기와 클라이언트 컴포넌트에만 있고 카탈로그 데이터는 건드리지 않는다.
 */

export type View = { x: number; y: number; k: number };
export type Size = { width: number; height: number };
export type Rect = Size & { x: number; y: number };

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

export const panBy = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x + dx,
  y: view.y + dy,
});

/** `factor`만큼 확대한다. 화면의 (px, py)가 같은 내용 지점 위에 남는다. */
export const zoomAt = (view: View, factor: number, px: number, py: number): View => {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
};

/** 내용을 뷰포트에 맞춰 키우고(1:1을 넘지 않는다) 가운데에 둔다. */
export const fitView = (content: Size, viewport: Size, padding = 24): View => {
  const k = clampZoom(
    Math.min(
      (viewport.width - padding * 2) / content.width,
      (viewport.height - padding * 2) / content.height,
      1,
    ),
  );
  return {
    k,
    x: (viewport.width - content.width * k) / 2,
    y: (viewport.height - content.height * k) / 2,
  };
};

/** 내용 사각형이 뷰포트에 온전히 들어오도록 가장 조금만 이동한다. */
export const revealRect = (view: View, rect: Rect, viewport: Size, margin = 24): View => {
  const shift = (start: number, size: number, limit: number) => {
    if (start < margin) return margin - start;
    if (start + size > limit - margin)
      return Math.max(limit - margin - (start + size), margin - start);
    return 0;
  };
  const left = view.x + rect.x * view.k;
  const top = view.y + rect.y * view.k;
  return panBy(
    view,
    shift(left, rect.width * view.k, viewport.width),
    shift(top, rect.height * view.k, viewport.height),
  );
};
