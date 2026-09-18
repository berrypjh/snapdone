import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read-only access to the repository the DevHub describes. Used by the data validation specs. */

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.next', 'out-tsc', 'test-output']);

export const exists = (path: string) => existsSync(join(ROOT, path));
export const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
export const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `Type.method` is a Go method (matched by receiver); anything else is a whole word. */
export const symbolPattern = (symbol: string) => {
  const [type, method] = symbol.split('.');
  return method
    ? new RegExp(`func \\(\\w+ \\*?${escape(type)}\\) ${escape(method)}\\(`)
    : new RegExp(`(?<![\\w$])${escape(symbol)}(?![\\w$])`);
};

/** A markdown heading of any level whose text is exactly `heading`. */
export const headingPattern = (heading: string) => new RegExp(`^#{1,6} ${escape(heading)}$`, 'm');

/** Repository-relative paths of every file under `path` (or `path` itself), skipping build output. */
export const filesUnder = (path: string): string[] => {
  if (statSync(join(ROOT, path)).isFile()) return [path];
  return readdirSync(join(ROOT, path), { withFileTypes: true }).flatMap((entry) =>
    SKIPPED_DIRS.has(entry.name) ? [] : filesUnder(`${path}/${entry.name}`),
  );
};

/** Subdirectories of `parent` that contain `file`, as repository-relative paths to that file. */
export const manifestPaths = (parent: string, file: string) =>
  readdirSync(join(ROOT, parent))
    .map((dir) => `${parent}/${dir}/${file}`)
    .filter(exists);
