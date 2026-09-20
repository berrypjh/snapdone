import { catalog } from '../data';
import type { CommandConstraint, SourceRef, TestRef } from '../domain/model';

/** 어느 프로젝트에도 속하지 않는 경로(루트 파일, `docs/`). */
export const REPOSITORY_GROUP = '저장소';

export type FileGroup = {
  path: string;
  /** 파일 이름. 독자가 눈으로 훑는 부분이다. */
  name: string;
  /** 프로젝트(또는 저장소) 안의 폴더. 흐리게 보이고, 루트면 비어 있다. */
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

/** 항목을 프로젝트별로, 다시 파일별로 묶는다. 처음 나온 순서를 지킨다. */
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

/** 파일 하나를 화면에 보여 줄 형태로 나눈다. */
export const fileOf = (path: string): FileGroup => {
  const { name, folder } = splitPath(path);
  return { path, name, folder, symbols: [] };
};

/** 파일당 한 줄. 같은 파일이 여러 symbol로 인용되면 한 줄로 합친다. */
export const groupSources = (refs: SourceRef[]): ProjectGroup<FileGroup>[] =>
  groupByFile(refs, fileOf, (group, index) => {
    const symbol = refs[index].symbol;
    if (symbol && !group.symbols.includes(symbol)) group.symbols.push(symbol);
  });

const testTitle = (test: TestRef) =>
  test.title ? test.title.join(' › ') : String(test.source.symbol);

/** 테스트 파일당 한 줄. 러너와 실행 조건은 한 번만 적는다. */
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

/** `web 4 · api 2`: 프로젝트마다 참조가 몇 개인지. */
export const countByProject = <T>(groups: ProjectGroup<T>[], size: (file: T) => number) =>
  groups
    .map(({ project, files }) => `${project} ${files.reduce((n, file) => n + size(file), 0)}`)
    .join(' · ');

/** `vitest 3 · go-test 2`: 러너마다 테스트가 몇 개인지. */
export const countByRunner = (tests: TestRef[]) => {
  const counts = new Map<string, number>();
  for (const test of tests) counts.set(test.runner, (counts.get(test.runner) ?? 0) + 1);
  return [...counts].map(([runner, count]) => `${runner} ${count}`).join(' · ');
};
