import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { editorHref } from './editor-link';
import { REPOSITORY_ROOT } from './snapshot';

/** 에디터를 고르지 않은 개발 서버. 로컬 env 파일이 테스트 결과를 좌우하면 안 된다. */
const inDevelopment = () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEVHUB_EDITOR', '');
};
const absolute = (path: string) => join(String(REPOSITORY_ROOT), path);

afterEach(() => vi.unstubAllEnvs());

describe('editorHref', () => {
  it('is null outside the dev server, so a built page carries no machine path', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(editorHref('apps/devhub/src/lib/editor-link.ts')).toBeNull();
  });

  it('opens the file at its absolute path while the dev server runs', () => {
    inDevelopment();
    expect(editorHref('apps/devhub/src/lib/editor-link.ts')).toBe(
      `vscode://file${absolute('apps/devhub/src/lib/editor-link.ts')}`,
    );
  });

  it('takes the editor named in DEVHUB_EDITOR', () => {
    inDevelopment();
    vi.stubEnv('DEVHUB_EDITOR', 'Cursor');
    expect(editorHref('package.json')).toBe(`cursor://file${absolute('package.json')}`);
  });

  it('knows the editors whose scheme differs from their name', () => {
    inDevelopment();
    vi.stubEnv('DEVHUB_EDITOR', 'antigravity');
    expect(editorHref('package.json')).toBe(`antigravity-ide://file${absolute('package.json')}`);
  });

  it('takes a URL template for an editor it does not know', () => {
    inDevelopment();
    vi.stubEnv('DEVHUB_EDITOR', 'mate://open?url=file://{path}');
    expect(editorHref('package.json')).toBe(`mate://open?url=file://${absolute('package.json')}`);
  });

  it('falls back to the default editor when the setting is neither', () => {
    inDevelopment();
    vi.stubEnv('DEVHUB_EDITOR', 'my-editor');
    expect(editorHref('package.json')).toBe(`vscode://file${absolute('package.json')}`);
  });

  it('refuses a path that is not repository-relative', () => {
    inDevelopment();
    for (const path of ['/etc/passwd', '../secrets.txt', '']) {
      expect(editorHref(path)).toBeNull();
    }
  });
});
