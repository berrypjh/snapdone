import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** DevHub가 설명하는 저장소를 읽기 전용으로 연다. 데이터 검증 spec이 쓴다. */

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'out-tsc', 'test-output']);

export const exists = (path: string) => existsSync(join(ROOT, path));
export const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
export const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `Type.method`은 Go 메서드로 보고 receiver로 찾는다. 그 밖은 단어 전체로 찾는다. */
export const symbolPattern = (symbol: string) => {
  const [type, method] = symbol.split('.');
  return method
    ? new RegExp(`func \\(\\w+ \\*?${escape(type)}\\) ${escape(method)}\\(`)
    : new RegExp(`(?<![\\w$])${escape(symbol)}(?![\\w$])`);
};

/** 내용이 정확히 `heading`인 마크다운 제목. 제목 수준은 가리지 않는다. */
export const headingPattern = (heading: string) => new RegExp(`^#{1,6} ${escape(heading)}$`, 'm');

/** `path` 아래 모든 파일(또는 `path` 자신)의 저장소 기준 경로. 빌드 산출물은 건너뛴다. */
export const filesUnder = (path: string): string[] => {
  if (statSync(join(ROOT, path)).isFile()) return [path];
  return readdirSync(join(ROOT, path), { withFileTypes: true }).flatMap((entry) =>
    SKIPPED_DIRS.has(entry.name) ? [] : filesUnder(`${path}/${entry.name}`),
  );
};

/** `parent` 아래에서 `file`을 가진 하위 폴더를, 그 파일의 저장소 기준 경로로 돌려준다. */
export const manifestPaths = (parent: string, file: string) =>
  readdirSync(join(ROOT, parent))
    .map((dir) => `${parent}/${dir}/${file}`)
    .filter(exists);
