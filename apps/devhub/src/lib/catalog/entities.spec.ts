import { describe, expect, it } from 'vitest';

import { catalog } from '../../data';

import { COMMAND_GROUPS, entityHref, findEntity, SECTIONS } from './entities';
import { inspect } from './inspection';

const entities = SECTIONS.flatMap((section) => section.entities);

describe('explorer sections', () => {
  it('hold every scenario, project, document, record, and command in the catalog', () => {
    const count = (id: string) => SECTIONS.find((section) => section.id === id)?.entities.length;
    expect(count('scenarios')).toBe(catalog.scenarios.length);
    expect((count('applications') ?? 0) + (count('libraries') ?? 0)).toBe(
      catalog.nodes.filter((node) => node.kind !== 'external').length,
    );
    expect(count('documents')).toBe(catalog.documents.length);
    expect(count('records')).toBe(catalog.records.length);
    expect(count('engineering')).toBe(COMMAND_GROUPS.length);
  });

  it('give every entity a unique route that resolves back to it', () => {
    const hrefs = entities.map(entityHref);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const entity of entities) {
      expect(findEntity(entity.section, entity.id)).toBe(entity);
    }
  });
});

describe('inspect', () => {
  it('explains every empty inspector section', () => {
    for (const entity of entities) {
      const inspection = inspect(entity);
      expect(inspection.source.length > 0 || inspection.sourceEmpty.length > 0).toBe(true);
      expect(inspection.docs.length > 0 || inspection.docsEmpty.length > 0).toBe(true);
      expect(inspection.tests.length > 0 || inspection.testsEmpty.length > 0).toBe(true);
    }
  });

  it('collects every test a scenario step cites', () => {
    for (const entity of entities) {
      if (entity.section !== 'scenarios') continue;
      const shown = new Set(inspect(entity).tests.map((test) => test.id));
      const cited = entity.record.steps.flatMap((step) => step.tests);
      expect(cited.filter((id) => !shown.has(id))).toEqual([]);
    }
  });

  it('shows no source for a product target', () => {
    const targets = entities.filter(
      (entity) => entity.section === 'scenarios' && entity.record.track === 'product-target',
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const entity of targets) expect(inspect(entity).source).toEqual([]);
  });
});
