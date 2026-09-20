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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

/** 마크다운 페이지 한 벌. 셸, 글이 담긴 작업 영역, 상세 정보. */
const page = (section: 'documents' | 'records', id: string) => {
  const entity = findEntity(section, id);
  if (entity?.section !== section) throw new Error(`no ${section} ${id}`);
  return renderToStaticMarkup(
    createElement(DevHubShell, {
      selection: { section, id },
      inspector: createElement(Inspector, { inspection: inspect(entity) }),
      children: createElement(Workspace, {
        eyebrow: section === 'documents' ? '문서' : '기록',
        title: entity.record.title,
        children: createElement(EntitySummary, { entity }),
      }),
    }),
  );
};

const pages = [
  ...catalog.documents.map((doc) => ['documents', doc.id] as const),
  ...catalog.records.map((record) => ['records', record.id] as const),
];

describe.each(pages)('%s page %s', (section, id) => {
  it('uses every id once, so anchors and skip links land where they should', () => {
    const ids = [...page(section, id).matchAll(/ id="([^"]+)"/g)].map(([, value]) => value);
    expect(ids.filter((value, index) => ids.indexOf(value) !== index)).toEqual([]);
    expect(
      ids.filter((value) => value === MAIN_CONTENT_ID || value === INSPECTOR_ID).sort(),
    ).toEqual([INSPECTOR_ID, MAIN_CONTENT_ID].sort());
  });
});
