import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';
import { headingPattern, read } from '../../test-support/repository-files';

import { detailScenarios, documentHref, JOURNEY_ID, START_DOCS, startPath } from './start-path';

const journey = catalog.scenarios.find((scenario) => scenario.id === JOURNEY_ID);

describe('start path', () => {
  it('opens a journey that exists in the catalog and has detail scenarios', () => {
    expect(journey).toBeDefined();
    if (!journey) return;
    const details = detailScenarios(journey);
    expect(details.length).toBeGreaterThan(0);
    expect(details.map((scenario) => scenario.id)).toContain('process-photo');
  });

  it('points only at documents and headings that exist, word for word', () => {
    for (const link of Object.values(START_DOCS)) {
      const doc = catalog.documents.find((candidate) => candidate.id === link.document);
      expect(doc, link.document).toBeDefined();
      if (!doc) continue;
      expect(read(doc.path), `${doc.path} § ${link.heading}`).toMatch(headingPattern(link.heading));
    }
  });

  it('builds document anchors the way document pages name their headings', () => {
    expect(documentHref(START_DOCS.beforePr)).toBe('/documents/quality-gates#pr-올리기-전에');
    expect(documentHref({ document: 'readme' })).toBe('/documents/readme');
  });

  it('has three steps whose links all stay inside DevHub', () => {
    const steps = startPath();
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      expect(step.links.length).toBeGreaterThan(0);
      for (const link of step.links) expect(link.href).toMatch(/^\//);
    }
  });

  it('links every product application and every boundary in the second step', () => {
    const [, boundaries] = startPath();
    const hrefs = boundaries.links.map((link) => link.href);
    for (const node of catalog.nodes) {
      if (node.kind === 'application' && node.role === 'product') {
        expect(hrefs).toContain(`/applications/${node.id}`);
      }
    }
    for (const boundary of catalog.boundaries) {
      expect(hrefs).toContain(`/architecture#boundary-${boundary.id}`);
    }
  });
});
