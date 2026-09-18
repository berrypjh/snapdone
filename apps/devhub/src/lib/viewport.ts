/**
 * Pan/zoom math for the flow viewer. Pure: screen = content × k + (x, y).
 * Viewer state lives only here and in the client component; it never touches catalog data.
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

/** Zooms by `factor` keeping the screen point (px, py) over the same content point. */
export const zoomAt = (view: View, factor: number, px: number, py: number): View => {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
};

/** Scales content to fit the viewport (never above 1:1) and centers it. */
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

/** Pans the least amount that brings a content rect fully into the viewport. */
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
