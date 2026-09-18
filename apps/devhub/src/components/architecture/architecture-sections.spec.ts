import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '@/data';

import { BoundaryList, TargetOnlyList } from './architecture-sections';

describe('BoundaryList', () => {
  it('names each relation as a tag after its two ends', () => {
    const html = renderToStaticMarkup(createElement(BoundaryList));
    for (const boundary of catalog.boundaries) expect(html).toContain(boundary.name);
    expect(html).toMatch(/→ <a[^>]*>[^<]+<\/a><\/span><span class="rounded-sm/);
  });
});

describe('TargetOnlyList', () => {
  it('heads each target scenario with a link to it', () => {
    const html = renderToStaticMarkup(createElement(TargetOnlyList));
    const targets = catalog.scenarios.filter((scenario) => scenario.track === 'product-target');
    expect(targets.length).toBeGreaterThan(0);
    for (const scenario of targets)
      expect(html).toMatch(
        new RegExp(`<h3 id="target-${scenario.id}"[^>]*><a[^>]*href="/scenarios/${scenario.id}"`),
      );
  });
});
