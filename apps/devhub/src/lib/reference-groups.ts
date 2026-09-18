import { catalog } from '../data';
import type { CommandConstraint, SourceRef, TestRef } from '../domain/model';

/** Paths outside every project (root files, `docs/`). */
export const REPOSITORY_GROUP = '저장소';

export type FileGroup = {
  path: string;
  /** File name, the part a reader scans for. */
  name: string;
  /** Folder inside the project (or the repository), shown dimmed. Empty at the root. */
  folder: string;
  symbols: string[];
};

export type TestFileGroup = FileGroup & {
  runner: TestRef['runner'];
  requires: CommandConstraint[];
  titles: string[];
};

export type ProjectGroup<T> = { project: string; files: T[] };

const projectRoots = catalog.nodes.flatMap((node) =>
  node.kind === 'external' ? [] : [{ id: node.id, root: node.root }],
);

const splitPath = (path: string) => {
  const project = projectRoots.find(({ root }) => path.startsWith(`${root}/`));
  const inside = project ? path.slice(project.root.length + 1) : path;
  const cut = inside.lastIndexOf('/');
  return {
    project: project?.id ?? REPOSITORY_GROUP,
    name: inside.slice(cut + 1),
    folder: cut === -1 ? '' : inside.slice(0, cut + 1),
  };
};

/** Groups items by project, then by file, keeping first-seen order. */
const groupByFile = <T extends FileGroup>(
  items: { path: string }[],
  start: (path: string) => T,
  add: (group: T, index: number) => void,
): ProjectGroup<T>[] => {
  const projects = new Map<string, Map<string, T>>();
  items.forEach(({ path }, index) => {
    const { project } = splitPath(path);
    const files = projects.get(project) ?? new Map<string, T>();
    projects.set(project, files);
    const group = files.get(path) ?? start(path);
    files.set(path, group);
    add(group, index);
  });
  return [...projects].map(([project, files]) => ({ project, files: [...files.values()] }));
};

/** A single file, split for display. */
export const fileOf = (path: string): FileGroup => {
  const { name, folder } = splitPath(path);
  return { path, name, folder, symbols: [] };
};

/** One row per file: a reference list with the same file cited for several symbols collapses. */
export const groupSources = (refs: SourceRef[]): ProjectGroup<FileGroup>[] =>
  groupByFile(refs, fileOf, (group, index) => {
    const symbol = refs[index].symbol;
    if (symbol && !group.symbols.includes(symbol)) group.symbols.push(symbol);
  });

const testTitle = (test: TestRef) =>
  test.title ? test.title.join(' › ') : String(test.source.symbol);

/** One row per test file, with its runner and run conditions said once. */
export const groupTests = (tests: TestRef[]): ProjectGroup<TestFileGroup>[] =>
  groupByFile(
    tests.map((test) => test.source),
    (path): TestFileGroup => {
      const test = tests.find((t) => t.source.path === path) as TestRef;
      return { ...fileOf(path), runner: test.runner, requires: test.requires, titles: [] };
    },
    (group, index) => {
      const test = tests[index];
      group.titles.push(testTitle(test));
      group.requires = [...new Set([...group.requires, ...test.requires])];
    },
  );

/** `web 4 · api 2`: how many references each project holds. */
export const countByProject = <T>(groups: ProjectGroup<T>[], size: (file: T) => number) =>
  groups
    .map(({ project, files }) => `${project} ${files.reduce((n, file) => n + size(file), 0)}`)
    .join(' · ');

/** `vitest 3 · go-test 2`: how many tests each runner holds. */
export const countByRunner = (tests: TestRef[]) => {
  const counts = new Map<string, number>();
  for (const test of tests) counts.set(test.runner, (counts.get(test.runner) ?? 0) + 1);
  return [...counts].map(([runner, count]) => `${runner} ${count}`).join(' · ');
};
