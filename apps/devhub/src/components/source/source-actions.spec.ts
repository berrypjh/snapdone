import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RepositorySnapshot } from '../../domain/model';

import { SourceActions } from './source-actions';

vi.mock('../../lib/repository/snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/repository/snapshot')>()),
  currentSnapshot: (): RepositorySnapshot => ({
    repositoryId: 'snapdone',
    commit: 'a'.repeat(40),
    branch: 'main',
    source: 'env',
    dirty: false,
  }),
  committedPaths: () => null,
}));

const PATH = 'apps/devhub/src/lib/repository/editor-link.ts';

/**
 * 한 모드로 그린다. 모드는 항상 밝힌다. 로컬 env 파일이 테스트 실행의 `NODE_ENV`를 정하므로
 * 그대로 두면 머신에 따라 통과 여부가 갈린다.
 */
const render = (mode: 'development' | 'production') => {
  vi.stubEnv('NODE_ENV', mode);
  return renderToStaticMarkup(createElement(SourceActions, { source: { path: PATH } }));
};

afterEach(() => vi.unstubAllEnvs());

describe('SourceActions', () => {
  it('joins the remote views into one line, without a dangling separator', () => {
    const html = render('production');
    expect(html).toContain('github.com에서 보기');
    expect(html).toContain('최신 main에서 보기');
    expect((html.match(/aria-hidden="true"[^>]*>·/g) ?? []).length).toBe(1);
  });

  it('carries the actions of the path as icons, editor before copy, only while developing', () => {
    expect(render('production')).not.toContain('에디터에서 열기');

    vi.stubEnv('DEVHUB_EDITOR', 'cursor');
    const html = render('development');
    expect(html).toContain(`aria-label="에디터에서 열기: ${PATH}"`);
    expect(html).toMatch(
      new RegExp(`에디터에서 열기: ${PATH}"[\\s\\S]*?aria-label="경로 복사: ${PATH}"`),
    );
    // 에디터는 경로의 동작이지 아래 원격 보기 목록의 하나가 아니다.
    expect((html.match(/aria-hidden="true"[^>]*>·/g) ?? []).length).toBe(1);
  });
});
