import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { catalog } from '../data';

import EntityPage from './[section]/[id]/page';
import StepPage from './[section]/[id]/steps/[stepId]/page';
import ArchitectureNodePage from './architecture/[nodeId]/page';
import ArchitecturePage from './architecture/page';

/**
 * After a navigation Next scrolls to and focuses the first element of the new page segment. In
 * the layouts that keep a canvas mounted, that segment must be the workspace header: were it the
 * inspector, a narrow screen (inspector below the workspace) would open scrolled down to it.
 */
const firstTag = async (page: ReactNode | Promise<ReactNode>) =>
  renderToStaticMarkup(await page).match(/^<([a-z0-9]+)/)?.[1];

describe('page segments under the canvas layouts', () => {
  const scenario = catalog.scenarios[0];
  const node = catalog.nodes[0];

  it.each([
    [
      'entity',
      () => EntityPage({ params: Promise.resolve({ section: 'scenarios', id: scenario.id }) }),
    ],
    [
      'step',
      () =>
        StepPage({
          params: Promise.resolve({
            section: 'scenarios',
            id: scenario.id,
            stepId: scenario.steps[0].id,
          }),
        }),
    ],
    ['architecture', () => ArchitecturePage()],
    [
      'architecture node',
      () => ArchitectureNodePage({ params: Promise.resolve({ nodeId: node.id }) }),
    ],
  ])('%s page is the workspace header', async (_, render) => {
    expect(await firstTag(render())).toBe('header');
  });
});
