import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '@/data';

import { BoundaryList } from './architecture-sections';

describe('BoundaryList', () => {
  it('names each relation as a tag after its two ends', () => {
    const html = renderToStaticMarkup(createElement(BoundaryList));
    for (const boundary of catalog.boundaries) expect(html).toContain(boundary.name);
    expect(html).toMatch(/→ <a[^>]*>[^<]+<\/a><\/span><span class="rounded-sm/);
  });
});
