import { describe, expect, it } from 'vitest';

import { clampZoom, fitView, MAX_ZOOM, MIN_ZOOM, panBy, revealRect, zoomAt } from './viewport';

const toScreen = (view: { x: number; y: number; k: number }, cx: number, cy: number) => ({
  x: view.x + cx * view.k,
  y: view.y + cy * view.k,
});

describe('viewport', () => {
  it('clamps zoom', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const view = { x: 40, y: -20, k: 1 };
    const next = zoomAt(view, 1.5, 300, 200);
    const content = { x: (300 - view.x) / view.k, y: (200 - view.y) / view.k };
    const screen = toScreen(next, content.x, content.y);
    expect(screen.x).toBeCloseTo(300);
    expect(screen.y).toBeCloseTo(200);
  });

  it('fits large content inside the viewport and never enlarges small content', () => {
    const big = fitView({ width: 2000, height: 600 }, { width: 1000, height: 500 });
    expect(2000 * big.k).toBeLessThanOrEqual(1000);
    expect(big.x).toBeGreaterThanOrEqual(0);
    expect(fitView({ width: 200, height: 100 }, { width: 1000, height: 500 }).k).toBe(1);
  });

  it('pans the least needed to reveal a rect', () => {
    const viewport = { width: 800, height: 400 };
    const view = { x: 0, y: 0, k: 1 };
    const moved = revealRect(view, { x: 1000, y: 50, width: 200, height: 100 }, viewport);
    const right = moved.x + 1200 * moved.k;
    expect(right).toBeLessThanOrEqual(800);
    expect(moved.y).toBe(0);
    expect(revealRect(view, { x: 100, y: 100, width: 100, height: 100 }, viewport)).toEqual(view);
  });

  it('pans by a screen offset', () => {
    expect(panBy({ x: 1, y: 2, k: 1 }, 10, -5)).toEqual({ x: 11, y: -3, k: 1 });
  });
});
