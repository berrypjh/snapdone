import { catalog } from '../data';
import { RUNNER_COMMAND } from '../data/commands';
import { commandLine } from '../domain/links';
import type {
  ApiRef,
  ArchitectureNode,
  CommandRef,
  DocumentLink,
  DocumentRef,
  ImplementationStatus,
  Relation,
  Scenario,
  ScenarioStep,
  SourceRef,
  TestRef,
} from '../domain/model';

import {
  architectureHref,
  boundariesOf,
  findNode,
  nodeLabel,
  projectOf,
  scenarioNodeIds,
  stepNodeIds,
  stepsTouching,
} from './architecture';
import { documentOutline, type OutlineItem } from './documents';
import { commandHref, type Entity, stepHref } from './entities';
import { CONSTRAINT, GAP, INTERACTION, RELATION, ROLE, TRACK } from './labels';
import type { SourceUsage } from './source-usage';

export type Fact = { term: string; details: string[] };

export type ResolvedDocument = { document: DocumentRef; heading?: string };

export type RelatedLink = { label: string; href: string; detail?: string };

/** Navigation to other views of the same thing (scenario ↔ architecture). */
export type RelatedGroup = { title: string; links: RelatedLink[]; empty: string };

/** What the inspector shows for one entity. Empty lists come with the reason they are empty. */
export type Inspection = {
  /** A document's sections, shown as "이 페이지에서" above the evidence. */
  outline?: OutlineItem[];
  kind: string;
  title: string;
  status?: ImplementationStatus;
  facts: Fact[];
  source: SourceRef[];
  sourceEmpty: string;
  docs: ResolvedDocument[];
  docsEmpty: string;
  tests: TestRef[];
  testsEmpty: string;
  /** Routes the entity uses; shown with handler source and the generated Swagger document. */
  apis?: ApiRef[];
  related?: RelatedGroup[];
};

const uniqueBy = <T>(items: T[], key: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [key(item), item])).values(),
];

const documentById = new Map(catalog.documents.map((doc) => [doc.id, doc]));
const testById = new Map(catalog.tests.map((test) => [test.id, test]));
const runtimeName = new Map(catalog.runtimes.map((runtime) => [runtime.id, runtime.name]));

const resolveDocs = (links: DocumentLink[]): ResolvedDocument[] =>
  uniqueBy(links, (link) => `${link.document}#${link.heading ?? ''}`).flatMap((link) => {
    const document = documentById.get(link.document);
    return document ? [{ document, heading: link.heading }] : [];
  });

const resolveTests = (ids: string[]): TestRef[] =>
  [...new Set(ids)].flatMap((id) => testById.get(id) ?? []);

const relationLine = (relation: Relation) =>
  `${relation.from} → ${relation.to} · ${
    relation.kind === 'runtime' ? INTERACTION[relation.interaction] : RELATION[relation.kind]
  }`;

const nodeLinks = (ids: string[]): RelatedLink[] =>
  ids.flatMap((id) => {
    const node = findNode(id);
    return node ? [{ label: nodeLabel(node), href: architectureHref(id) }] : [];
  });

const inArchitecture = (ids: string[]): RelatedGroup => ({
  title: '아키텍처에서 보기',
  links: nodeLinks(ids),
  empty: '연결된 구성 요소가 없다',
});

const apisById = new Map(catalog.apis.map((api) => [api.id, api]));
const resolveApis = (ids: string[]): ApiRef[] =>
  [...new Set(ids)].flatMap((id) => apisById.get(id) ?? []);

/** The root commands that run these tests, e.g. Vitest and go test → `pnpm test`. */
const commandsFor = (tests: TestRef[]): RelatedGroup => ({
  title: '이 테스트를 돌리는 명령',
  links: [...new Set(tests.map((test) => RUNNER_COMMAND[test.runner]))].flatMap((id) => {
    const command = catalog.commands.find((c) => c.id === id);
    return command
      ? [
          {
            label: commandLine(command),
            href: commandHref(command),
            detail: command.constraints.length
              ? `실행 조건: ${command.constraints.map((c) => CONSTRAINT[c]).join(' · ')}`
              : undefined,
          },
        ]
      : [];
  }),
  empty: '인용된 테스트가 없다',
});

const touchingSteps = (nodeId: string): RelatedGroup => ({
  title: '관련 시나리오 단계',
  links: stepsTouching(nodeId).map(({ scenario, step, href }) => ({
    label: step.intent,
    href,
    detail: scenario.title,
  })),
  empty: '이 구성 요소를 거치는 시나리오 단계가 없다',
});

const relationsOf = (id: string) =>
  catalog.relations.filter((relation) => relation.from === id || relation.to === id);

const stepsOwnedBy = (id: string) =>
  catalog.scenarios.flatMap((scenario) => scenario.steps.filter((step) => step.owner === id));

const inspectScenario = (entity: Extract<Entity, { section: 'scenarios' }>): Inspection => {
  const { record } = entity;
  const gaps = [...record.gaps, ...record.steps.flatMap((step) => step.gaps ?? [])];
  return {
    kind: '시나리오',
    title: record.title,
    status: record.status,
    facts: [
      { term: '목표', details: [record.goal] },
      { term: '구분', details: [TRACK[record.track]] },
      { term: '단계', details: [`${record.steps.length}개`] },
      {
        term: '런타임',
        details: [
          ...new Set(record.steps.map((step) => runtimeName.get(step.runtime) ?? step.runtime)),
        ],
      },
      { term: '담당', details: [...new Set(record.steps.map((step) => step.owner))] },
      { term: '증거 공백', details: gaps.map((gap) => `${GAP[gap.kind]} — ${gap.note}`) },
    ],
    source: uniqueBy(
      record.steps.flatMap((step) => step.source),
      (ref) => `${ref.path}#${ref.symbol ?? ''}`,
    ),
    sourceEmpty: '이 시나리오에는 코드가 없다. 각 단계의 부재 검색이 근거다',
    docs: resolveDocs([...record.docs, ...record.steps.flatMap((step) => step.docs)]),
    docsEmpty: '연결된 문서가 없다',
    tests: resolveTests([
      ...record.steps.flatMap((step) => step.tests),
      ...gaps.flatMap((gap) => gap.tests ?? []),
    ]),
    testsEmpty: '이 시나리오를 검증하는 테스트가 없다',
    apis: resolveApis(record.steps.flatMap((step) => step.apis)),
    related: [
      inArchitecture(scenarioNodeIds(record)),
      commandsFor(
        resolveTests([
          ...record.steps.flatMap((step) => step.tests),
          ...gaps.flatMap((gap) => gap.tests ?? []),
        ]),
      ),
    ],
  };
};

const inspectProject = (
  entity: Extract<Entity, { section: 'applications' | 'libraries' }>,
): Inspection => {
  const { record } = entity;
  const steps = stepsOwnedBy(record.id);
  return {
    kind: record.kind === 'application' ? `애플리케이션 · ${ROLE[record.role]}` : '라이브러리',
    title: record.id,
    facts: [
      { term: '요약', details: [record.summary] },
      { term: '스택', details: [record.stack] },
      { term: '패키지', details: record.packageName ? [record.packageName] : ['없음 (Go module)'] },
      { term: 'Nx tag', details: record.nxTags },
      { term: '관계', details: relationsOf(record.id).map(relationLine) },
      { term: '담당 단계', details: [`시나리오 단계 ${steps.length}개`] },
    ],
    source: [{ path: record.root }, record.manifest],
    sourceEmpty: '',
    docs: resolveDocs(steps.flatMap((step) => step.docs)),
    docsEmpty: '이 프로젝트가 담당한 시나리오 단계가 인용한 문서가 없다',
    tests: catalog.tests.filter((test) => test.source.path.startsWith(`${record.root}/`)),
    testsEmpty: '시나리오 근거로 인용된 이 프로젝트의 테스트가 없다',
    related: [inArchitecture([record.id]), touchingSteps(record.id)],
  };
};

const inspectDocument = (entity: Extract<Entity, { section: 'documents' }>): Inspection => {
  const { record } = entity;
  const citing = catalog.scenarios.filter((scenario) =>
    [...scenario.docs, ...scenario.steps.flatMap((step) => step.docs)].some(
      (link) => link.document === record.id,
    ),
  );
  return {
    kind: '문서',
    title: record.title,
    outline: documentOutline(record),
    facts: [
      { term: '주제', details: [record.topic] },
      { term: '인용한 시나리오', details: citing.map((scenario) => scenario.title) },
    ],
    source: [{ path: record.path }],
    sourceEmpty: '',
    docs: [],
    docsEmpty: '문서 자체다',
    tests: [],
    testsEmpty: '문서는 테스트 대상이 아니다',
  };
};

/** Where the command is declared: root `package.json` or the project's Nx manifest. */
const commandSource = ({ source }: CommandRef): SourceRef[] => {
  if (source.kind === 'package-script') return [{ path: 'package.json' }];
  const project = catalog.nodes.find((node) => node.id === source.project);
  return project && project.kind !== 'external' ? [project.manifest] : [];
};

const inspectCommandGroup = (entity: Extract<Entity, { section: 'engineering' }>): Inspection => {
  const { record } = entity;
  const constraints = [...new Set(record.commands.flatMap((command) => command.constraints))];
  const sources = record.commands.flatMap(commandSource);
  return {
    kind: '명령 묶음',
    title: record.title,
    facts: [
      { term: '설명', details: [record.summary] },
      { term: '명령', details: record.commands.map(commandLine) },
      {
        term: '실행 조건',
        details: constraints.length
          ? constraints.map((constraint) => CONSTRAINT[constraint])
          : ['없음 — 어디서나 돈다'],
      },
    ],
    source: sources.filter((ref, index) => sources.findIndex((r) => r.path === ref.path) === index),
    sourceEmpty: '정의 위치를 찾지 못했다',
    docs: [],
    docsEmpty: '연결된 문서가 없다',
    tests: [],
    testsEmpty: '명령은 테스트를 인용하지 않는다',
  };
};

const apiLabel = new Map(catalog.apis.map((api) => [api.id, `${api.method} ${api.path}`]));
const contractLabel = new Map(
  catalog.contracts.map((contract) => [contract.id, `${contract.name} (${contract.owner})`]),
);
const scenarioTitle = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario.title]));

/** One step of a scenario: the flow viewer's selection. */
export const inspectStep = (scenario: Scenario, step: ScenarioStep): Inspection => {
  const intentOf = new Map(scenario.steps.map((s) => [s.id, s.intent]));
  return {
    kind: `시나리오 단계 · ${scenario.title}`,
    title: step.intent,
    status: step.status,
    facts: [
      { term: '시스템 동작', details: [step.behavior] },
      { term: '런타임', details: [runtimeName.get(step.runtime) ?? step.runtime] },
      { term: '담당', details: [step.owner] },
      { term: 'API', details: step.apis.map((id) => apiLabel.get(id) ?? id) },
      { term: '계약', details: step.contracts.map((id) => contractLabel.get(id) ?? id) },
      { term: '다음', details: step.next.map((id) => intentOf.get(id) ?? id) },
      { term: '경유', details: (step.via ?? []).map((id) => scenarioTitle.get(id) ?? id) },
      {
        term: '증거 공백',
        details: (step.gaps ?? []).map((gap) => `${GAP[gap.kind]} — ${gap.note}`),
      },
      {
        term: '부재 검색',
        details: (step.absence ?? []).map(
          (check) => `${check.meaning} (${check.terms.join(', ')})`,
        ),
      },
    ],
    source: step.source,
    sourceEmpty: '이 단계에는 코드가 없다. 부재 검색이 근거다',
    docs: resolveDocs(step.docs),
    docsEmpty: '이 단계가 직접 인용한 문서가 없다',
    tests: resolveTests(step.tests),
    testsEmpty: '이 단계를 직접 검증하는 테스트가 없다',
    apis: resolveApis(step.apis),
    related: [inArchitecture(stepNodeIds(step)), commandsFor(resolveTests(step.tests))],
  };
};

const projectPage = (node: ArchitectureNode): RelatedLink[] =>
  node.kind === 'external'
    ? []
    : [
        {
          label: `${node.id} 상세`,
          href: `/${node.kind === 'library' ? 'libraries' : 'applications'}/${node.id}`,
        },
      ];

/** One node of the architecture view: its role, boundaries, relations, and the steps through it. */
export const inspectNode = (node: ArchitectureNode): Inspection => {
  const project = node.kind !== 'external';
  return {
    kind:
      node.kind === 'application'
        ? `애플리케이션 · ${ROLE[node.role]}`
        : node.kind === 'library'
          ? '라이브러리'
          : '외부',
    title: nodeLabel(node),
    facts: [
      { term: '역할', details: [node.summary] },
      ...(project ? [{ term: '스택', details: [node.stack] }] : []),
      { term: '경계', details: boundariesOf(node.id).map((boundary) => boundary.name) },
      { term: '관계', details: relationsOf(node.id).map(relationLine) },
      ...(node.standalone ? [{ term: '관계 없음', details: [node.standalone] }] : []),
    ],
    source: project ? [{ path: node.root }, node.manifest] : node.evidence,
    sourceEmpty: '근거 source가 없다',
    docs: resolveDocs([
      ...node.docs,
      ...boundariesOf(node.id).flatMap((boundary) => boundary.docs),
    ]),
    docsEmpty: '이 구성 요소를 설명하는 문서가 없다',
    tests: project
      ? catalog.tests.filter((test) => test.source.path.startsWith(`${node.root}/`))
      : [],
    testsEmpty: project
      ? '시나리오 근거로 인용된 이 프로젝트의 테스트가 없다'
      : '저장소 밖 시스템이다. 이를 부르는 쪽의 테스트는 관련 시나리오 단계에 있다',
    related: [
      touchingSteps(node.id),
      { title: '프로젝트 상세', links: projectPage(node), empty: '저장소 밖 시스템이다' },
    ],
  };
};

/** A cited repository file: where it is used, with its own tests and APIs. */
export const inspectSource = (usage: SourceUsage): Inspection => {
  const project = projectOf(usage.path);
  return {
    kind: '소스 파일',
    title: usage.path,
    facts: [
      { term: 'symbol', details: usage.symbols },
      { term: '계약', details: usage.contracts.map((c) => `${c.name} (${c.kind})`) },
      { term: '프로젝트', details: project ? [project] : ['없음 — 프로젝트 밖 파일'] },
    ],
    source: [{ path: usage.path }],
    sourceEmpty: '',
    docs: resolveDocs(usage.steps.flatMap(({ step }) => step.docs)),
    docsEmpty: '이 파일을 인용한 단계가 인용한 문서가 없다',
    tests: usage.tests,
    testsEmpty: '이 파일에 정의된, 근거로 인용된 테스트가 없다',
    apis: usage.apis,
    related: [
      {
        title: '이 파일을 인용한 시나리오 단계',
        links: usage.steps.map(({ scenario, step }) => ({
          label: step.intent,
          href: stepHref(scenario.id, step.id),
          detail: scenario.title,
        })),
        empty: '인용한 시나리오 단계가 없다',
      },
      inArchitecture([
        ...new Set([...(project ? [project] : []), ...usage.nodes.map((n) => n.id)]),
      ]),
      commandsFor(usage.tests),
    ],
  };
};

export const inspect = (entity: Entity): Inspection => {
  switch (entity.section) {
    case 'scenarios':
      return inspectScenario(entity);
    case 'applications':
    case 'libraries':
      return inspectProject(entity);
    case 'documents':
      return inspectDocument(entity);
    case 'engineering':
      return inspectCommandGroup(entity);
  }
};
