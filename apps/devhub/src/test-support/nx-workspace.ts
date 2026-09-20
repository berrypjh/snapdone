import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROOT } from './repository-files';

type GraphFile = {
  graph: { nodes: Record<string, { data: { targets: Record<string, unknown> } }> };
};

/**
 * Nx가 직접 해석한 프로젝트와 target. 추론된 target도 포함한다. 설치된 `nx`에 daemon 없이
 * `nx graph --file`로 한 번만 묻는다.
 */
export const nxProjectTargets = (): Map<string, Set<string>> => {
  const file = join(mkdtempSync(join(tmpdir(), 'devhub-nx-')), 'graph.json');
  execFileSync(join(ROOT, 'node_modules/.bin/nx'), ['graph', `--file=${file}`], {
    cwd: ROOT,
    env: { ...process.env, NX_DAEMON: 'false' },
    stdio: 'ignore',
  });
  const { graph } = JSON.parse(readFileSync(file, 'utf8')) as GraphFile;
  return new Map(
    Object.entries(graph.nodes).map(([name, node]) => [
      name,
      new Set(Object.keys(node.data.targets)),
    ]),
  );
};

/** 루트 스크립트가 부르는 Nx 호출. `nx run-many -t a,b` · `nx run p:t` · `nx <target> <project>`. */
export const nxCallsIn = (script: string, projects: Set<string>) => {
  const runMany = [...script.matchAll(/\bnx run-many (?:-t|--targets?)[ =]([\w:,-]+)/g)].flatMap(
    ([, list]) => list.split(',').map((target) => ({ project: undefined, target })),
  );
  const run = [...script.matchAll(/\bnx run ([\w-]+):([\w:-]+)/g)].map(([, project, target]) => ({
    project,
    target,
  }));
  const short = [...script.matchAll(/\bnx ([\w:-]+) ([\w-]+)(?=\s|$)/g)]
    .filter(([, , project]) => projects.has(project))
    .map(([, target, project]) => ({ project, target }));
  return [...runMany, ...run, ...short];
};
