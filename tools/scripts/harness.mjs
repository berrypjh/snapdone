/**
 * berry-dev standards CLI를 고정한 shared-stack checkout에서 실행한다.
 *
 *   node tools/scripts/harness.mjs <sync|check>
 *
 * checkout 위치는 `SHARED_STACK_DIR`(없으면 저장소 옆 `../shared-stack`)다. plugin cache 경로는 쓰지 않는다.
 * checkout이 없거나 git checkout이 아니거나, HEAD · plugin 이름 · version이 `.claude/harness-source.json`과
 * 다르거나 plugin 경로에 미커밋 변경이 있으면 CLI를 부르지 않고 exit 2(berry-dev CLI와 같이 1은 drift만 뜻한다).
 * CI를 둔다면 `check`만 쓴다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PLUGIN_DIR = 'plugins/berry-dev';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** checkout 상태가 고정 값과 다르면 사유 목록, 같으면 빈 배열. */
export const sourceMismatches = (source, actual) => {
  const problems = [];
  if (actual.head !== source.commit) {
    problems.push(`commit ${actual.head} != pinned ${source.commit}`);
  }
  if (actual.plugin !== source.plugin) {
    problems.push(`plugin ${actual.plugin} != pinned ${source.plugin}`);
  }
  if (actual.version !== source.version) {
    problems.push(`version ${actual.version} != pinned ${source.version}`);
  }
  if (actual.dirty) {
    problems.push(`${PLUGIN_DIR} has uncommitted changes`);
  }
  return problems;
};

const inspectCheckout = (dir) => {
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  const manifest = readJson(path.join(dir, PLUGIN_DIR, '.claude-plugin/plugin.json'));
  return {
    head: git('rev-parse', 'HEAD'),
    plugin: manifest.name,
    version: manifest.version,
    dirty: git('status', '--porcelain', '--', PLUGIN_DIR) !== '',
  };
};

const main = () => {
  const command = process.argv[2];
  if (!['sync', 'check'].includes(command)) {
    console.error('usage: node tools/scripts/harness.mjs <sync|check>');
    return 2;
  }
  const dir = path.resolve(ROOT, process.env.SHARED_STACK_DIR ?? '../shared-stack');
  const source = readJson(path.join(ROOT, '.claude/harness-source.json'));
  let actual;
  try {
    actual = inspectCheckout(dir);
  } catch (error) {
    console.error(
      `harness: ${dir} is not a shared-stack git checkout (${error.code ?? 'git failed'})`,
    );
    console.error(`clone berrypjh/shared-stack at ${source.commit} there, or set SHARED_STACK_DIR`);
    return 2;
  }
  const problems = sourceMismatches(source, actual);
  if (problems.length > 0) {
    console.error(`harness: ${dir} is not the pinned shared-stack checkout`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`check out ${source.commit} there, or set SHARED_STACK_DIR`);
    return 2;
  }
  const cli = path.join(dir, PLUGIN_DIR, 'scripts/standards.mjs');
  return (
    spawnSync(process.execPath, [cli, command, '--project', ROOT], { stdio: 'inherit' }).status ?? 2
  );
};

if (import.meta.main) {
  process.exitCode = main();
}
