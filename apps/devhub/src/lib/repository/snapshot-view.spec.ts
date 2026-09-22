import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SnapshotSummary } from '../../components/overview/snapshot-summary';
import { SourceActions } from '../../components/source/source-actions';
import type { RepositorySnapshot } from '../../domain/model';

/** 스냅샷 커밋을 알아내지 못했을 때 독자가 보는 것. 그대로 말하고 지어내지 않는다. */

const unavailable: RepositorySnapshot = {
  repositoryId: 'snapdone',
  commit: null,
  branch: 'main',
  source: 'unavailable',
  dirty: null,
};

vi.mock('./snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./snapshot')>()),
  currentSnapshot: () => unavailable,
  committedPaths: () => null,
}));

describe('unavailable snapshot', () => {
  it('says the commit is unknown in the top bar and offers only branch links', () => {
    const html = renderToStaticMarkup(createElement(SnapshotSummary));
    expect(html).toContain('스냅샷 커밋을 알 수 없음');
    expect(html).toContain('main 브랜치 링크만 제공');
    expect(html).not.toMatch(/[0-9a-f]{7,40}/);
  });

  it('labels the branch link as the latest, and states that no permalink exists', () => {
    const html = renderToStaticMarkup(
      createElement(SourceActions, { source: { path: 'apps/web/src/lib/auth/handoff.ts' } }),
    );
    expect(html).toContain('/blob/main/apps/web/src/lib/auth/handoff.ts');
    expect(html).toContain('최신 main에서 보기');
    expect(html).toContain('스냅샷 커밋을 알 수 없어 고정 링크 없음');
    expect(html).not.toContain('@ ');
  });
});
