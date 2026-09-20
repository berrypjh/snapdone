import { join } from 'node:path';

import { isCanonicalPath } from '../../domain/links';

import { REPOSITORY_ROOT } from './snapshot';

/**
 * 에디터별 파일 주소 형식.
 */
const EDITOR_URL: Record<string, string> = {
  vscode: 'vscode://file{path}',
  cursor: 'cursor://file{path}',
  antigravity: 'antigravity-ide://file{path}',
  windsurf: 'windsurf://file{path}',
  zed: 'zed://file{path}',
  idea: 'jetbrains://idea/navigate/reference?path={path}',
  webstorm: 'jetbrains://web-storm/navigate/reference?path={path}',
};

const DEFAULT_EDITOR = 'vscode';

/**
 * `DEVHUB_EDITOR` 설정을 주소 형식으로 바꾼다. 아는 에디터 이름이면 위 표를, `{path}`가 들어 있으면
 * 그 값을 그대로 쓴다. 둘 다 아니면 기본값으로 돌아간다.
 */
const templateOf = (setting: string | undefined): string =>
  EDITOR_URL[(setting ?? DEFAULT_EDITOR).trim().toLowerCase()] ??
  (setting?.includes('{path}') ? setting : EDITOR_URL[DEFAULT_EDITOR]);

/**
 * 서버 전용. 이 컴퓨터의 에디터로 파일을 여는 링크이고, 만들지 않을 때는 `null`이다.
 * **개발 서버로 띄웠을 때만** 만든다 — 절대 경로는 이 머신의 것이라 빌드된 페이지에 들어가면 안 된다.
 * 경로는 저장소 상대 경로만 받는다(저장소 permalink와 같은 판정).
 */
export const editorHref = (path: string): string | null => {
  if (process.env.NODE_ENV !== 'development') return null;
  if (!REPOSITORY_ROOT || !isCanonicalPath(path)) return null;
  return templateOf(process.env.DEVHUB_EDITOR).replace(
    '{path}',
    encodeURI(join(REPOSITORY_ROOT, path)),
  );
};
