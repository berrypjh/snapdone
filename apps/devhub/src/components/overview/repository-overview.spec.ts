import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JOURNEY_ID } from '../../lib/catalog/start-path';

import { RepositoryOverview } from './repository-overview';

const html = renderToStaticMarkup(createElement(RepositoryOverview));

describe('repository overview', () => {
  it('tells the product and the tool apart before anything else', () => {
    expect(html.indexOf('Snapdone')).toBeLessThan(html.indexOf('DevHub'));
    expect(html.indexOf('DevHub')).toBeLessThan(html.indexOf('처음 10분'));
  });

  it('puts the start path before the repository facts and links the journey', () => {
    expect(html.indexOf('처음 10분')).toBeLessThan(html.indexOf('스냅샷 커밋'));
    expect(html).toContain(`href="/scenarios/${JOURNEY_ID}"`);
    expect(html).toContain('href="/documents/local-development#실행"');
  });
});
