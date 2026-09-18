import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DevHubShell } from '../components/devhub-shell';
import { EntitySummary } from '../components/entity-summary';
import { Inspector } from '../components/inspector';
import { INSPECTOR_ID, MAIN_CONTENT_ID, Workspace } from '../components/workspace';
import { catalog } from '../data';
import { findEntity } from '../lib/entities';
import { inspect } from '../lib/inspection';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** A whole document page: shell, workspace with the document, and its inspector. */
const page = (id: string) => {
  const entity = findEntity('documents', id);
  if (!entity || entity.section !== 'documents') throw new Error(`no document ${id}`);
  return renderToStaticMarkup(
    createElement(DevHubShell, {
      selection: { section: 'documents', id },
      inspector: createElement(Inspector, { inspection: inspect(entity) }),
      children: createElement(Workspace, {
        eyebrow: '문서',
        title: entity.record.title,
        children: createElement(EntitySummary, { entity }),
      }),
    }),
  );
};

describe.each(catalog.documents.map((doc) => [doc.id]))('document page %s', (id) => {
  it('uses every id once, so anchors and skip links land where they should', () => {
    const ids = [...page(id).matchAll(/ id="([^"]+)"/g)].map(([, value]) => value);
    expect(ids.filter((value, index) => ids.indexOf(value) !== index)).toEqual([]);
    expect(
      ids.filter((value) => value === MAIN_CONTENT_ID || value === INSPECTOR_ID).sort(),
    ).toEqual([INSPECTOR_ID, MAIN_CONTENT_ID].sort());
  });
});
