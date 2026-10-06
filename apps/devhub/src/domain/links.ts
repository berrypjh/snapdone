import type { GeneratedRange, RepositoryRef, RepositorySnapshot } from './model';

// 날 바이트가 아니라 이스케이프로 쓴다 - 제어 문자가 그대로 들어가면 git이 이 파일을 바이너리로 본다.
// eslint-disable-next-line no-control-regex -- 이 정규식이 거르려는 대상이 제어 문자다
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * 저장소 상대 POSIX 경로인지 본다. 루트(`/`로 시작) · 빈 세그먼트 · `.` · `..` · 역슬래시 ·
 * 제어 문자 · URL · `#` 앵커는 모두 거부한다. 공백과 한글은 허용하고 링크를 만들 때 인코딩한다.
 */
export const isCanonicalPath = (path: string): boolean =>
  path.length > 0 &&
  !CONTROL.test(path) &&
  !path.includes('\\') &&
  !path.includes('#') &&
  !path.includes('://') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

/** 세그먼트 단위로 인코딩한다. `/`는 구분자로 남고 나머지 글자는 escape된다. */
export const encodePath = (path: string): string => {
  if (!isCanonicalPath(path))
    throw new Error(`not a repository-relative path: ${JSON.stringify(path)}`);
  return path.split('/').map(encodeURIComponent).join('/');
};

export const isCommitSha = (value: string) => /^[0-9a-f]{40}$/.test(value);

/** URL 경로에 넣어도 안전한 브랜치 이름. `..`가 없고 앞뒤에 `/`가 없다. */
export const isSafeBranch = (value: string) =>
  /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(value) && !value.includes('..');

export type BrowseTarget = { path: string; directory: boolean; range?: GeneratedRange };

/**
 * 어느 revision의 경로를 여는 URL. 저장소 레코드가 가진 템플릿에서만 만든다. revision은 40자리
 * 커밋 SHA이거나 안전한 브랜치 이름이어야 하고, 경로는 저장소 상대 경로여야 한다. 줄 범위 앵커는
 * 수집기가 **같은 커밋에서** 만든 범위일 때만 붙인다.
 */
export const browseUrl = (repository: RepositoryRef, revision: string, target: BrowseTarget) => {
  if (!isCommitSha(revision) && !isSafeBranch(revision)) {
    throw new Error(`not a commit SHA or safe branch: ${JSON.stringify(revision)}`);
  }
  const template = target.directory ? repository.browse.directory : repository.browse.file;
  const url = template
    .replace('{base}', repository.webUrl)
    .replace('{rev}', revision.split('/').map(encodeURIComponent).join('/'))
    .replace('{path}', encodePath(target.path));
  const range = target.range;
  if (!range || target.directory || range.commit !== revision) return url;
  return (
    url +
    repository.browse.lineRange
      .replace('{start}', String(range.start))
      .replace('{end}', String(range.end))
  );
};

/** 정본 링크. 스냅샷 커밋에 고정한다. 커밋을 모르면 `null`이고 추측하지 않는다. */
export const permalink = (
  repository: RepositoryRef,
  snapshot: RepositorySnapshot,
  target: BrowseTarget,
): string | null => (snapshot.commit ? browseUrl(repository, snapshot.commit, target) : null);

/** 보조 링크. 움직이는 브랜치의 같은 경로라, DevHub가 판정한 코드와 다를 수 있다. */
export const latestUrl = (
  repository: RepositoryRef,
  snapshot: RepositorySnapshot,
  target: BrowseTarget,
): string => browseUrl(repository, snapshot.branch, target);

export const shortSha = (commit: string) => commit.slice(0, 7);

/** 링크 글자에 쓰는 호스트 이름(`github.com`). 제공자 이름을 코드에 박지 않는다. */
export const hostOf = (repository: RepositoryRef) => new URL(repository.webUrl).host;
