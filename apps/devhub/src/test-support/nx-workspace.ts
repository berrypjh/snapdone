import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROOT } from './repository-files';

type GraphFile = {
  graph: { nodes: Record<string, { data: { targets: Record<string, unknown> } }> };
};

/**
 * Projects and their targets as Nx itself resolves them, inferred targets included. Asks the
 * installed `nx` once (`nx graph --file`), without the daemon.
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

/** Nx calls a root script makes: `nx run-many -t a,b`, `nx run p:t`, and `nx <target> <project>`. */
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
