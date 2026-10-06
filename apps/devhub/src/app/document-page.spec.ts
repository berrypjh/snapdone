import { createElement } from 'react';

import { INSPECTOR_ID, MAIN_CONTENT_ID } from '@berrypjh/devhub-ui';
import { describe, expect, it, vi } from 'vitest';

import { EntitySummary } from '../components/entity/entity-summary';
import { Inspector } from '../components/entity/inspector';
import { DevHubShell } from '../components/shell/devhub-shell';
import { Workspace } from '../components/shell/workspace';
import { catalog } from '../data';
import { entityHref, findEntity } from '../lib/catalog/entities';
import { inspect } from '../lib/catalog/inspection';
import { renderInDevHub, testRouter } from '../test-support/devhub-provider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

/** 마크다운 페이지 한 벌. 셸, 글이 담긴 작업 영역, 상세 정보. */
const page = (section: 'documents' | 'records', id: string) => {
  const entity = findEntity(section, id);
  if (entity?.section !== section) throw new Error(`no ${section} ${id}`);
  return renderInDevHub(
    createElement(DevHubShell, {
      inspector: createElement(Inspector, { inspection: inspect(entity) }),
      children: createElement(Workspace, {
        eyebrow: section === 'documents' ? '문서' : '기록',
        title: entity.record.title,
        children: createElement(EntitySummary, { entity }),
      }),
    }),
    testRouter(entityHref(entity)),
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
