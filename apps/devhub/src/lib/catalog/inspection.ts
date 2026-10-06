import { catalog } from '../../data';
import type {
  ApiRef,
  ArchitectureNode,
  DocumentLink,
  DocumentRef,
  ImplementationStatus,
  Relation,
  Scenario,
  ScenarioStep,
  SourceRef,
  TestRef,
} from '../../domain/model';
import { type Pager, type PagerItem, pagerOf } from '../browser/pager';
import type { SourceUsage } from '../repository/source-usage';

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
import { architectureModel } from './architecture-layout';
import { type Entity, stepHref } from './entities';
import { GAP, INTERACTION, RECORD_KIND, RELATION, ROLE, TRACK } from './labels';

export type RelatedLink = { label: string; href: string; detail?: string };

/** 사실의 세부는 글이거나, 인스펙터가 보여 주는 다른 항목으로 가는 링크다. */
export type Fact = { term: string; details: (string | RelatedLink)[] };

export type ResolvedDocument = { document: DocumentRef; heading?: string };

/** 같은 것을 다른 화면에서 보는 이동 (시나리오 ↔ 아키텍처). */
export type RelatedGroup = { title: string; links: RelatedLink[]; empty: string };

/** 목록 순서의 아키텍처 노드. URL의 종류 필터를 따르는 넘김에 쓴다. */
export type NodeOrder = { current: string; nodes: (PagerItem & { kind: string })[] };

/** 인스펙터가 엔티티 하나에 대해 보여 주는 것. 빈 목록에는 비어 있는 이유가 따라붙는다. */
export type Inspection = {
  /** 시나리오 단계일 때 채운다. 제목 아래의 앞뒤 단계다. */
  pager?: Pager;
  /** 아키텍처 노드일 때 채운다. 제목 아래의 앞뒤 노드다. */
  nodeOrder?: NodeOrder;
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
  /** 엔티티가 쓰는 라우트. 핸들러 소스와 생성된 Swagger 문서를 함께 보여 준다. */
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

/** `id`의 관계 하나. 반대쪽 끝 노드로 링크한다. */
const relationLink = (id: string, relation: Relation): RelatedLink => ({
  label: relationLine(relation),
  href: architectureHref(relation.from === id ? relation.to : relation.from),
});

const nodeLinks = (ids: string[]): RelatedLink[] =>
  ids.flatMap((id) => {
    const node = findNode(id);
    return node ? [{ label: nodeLabel(node), href: architectureHref(id) }] : [];
  });

const inArchitecture = (ids: string[]): RelatedGroup => ({
  title: '아키텍처에서 보기',
  links: nodeLinks(ids),
  empty: '연결된 구성 요소 없음',
});

const apisById = new Map(catalog.apis.map((api) => [api.id, api]));
const resolveApis = (ids: string[]): ApiRef[] =>
  [...new Set(ids)].flatMap((id) => apisById.get(id) ?? []);

const touchingSteps = (nodeId: string): RelatedGroup => ({
  title: '관련 시나리오 단계',
  links: stepsTouching(nodeId).map(({ scenario, step, href }) => ({
    label: step.intent,
    href,
    detail: scenario.title,
  })),
  empty: '이 구성 요소를 거치는 시나리오 단계 없음',
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
    sourceEmpty: '이 시나리오에는 코드 없음. 각 단계의 부재 검색이 근거',
    docs: resolveDocs([...record.docs, ...record.steps.flatMap((step) => step.docs)]),
    docsEmpty: '연결된 문서 없음',
    tests: resolveTests([
      ...record.steps.flatMap((step) => step.tests),
      ...gaps.flatMap((gap) => gap.tests ?? []),
    ]),
    testsEmpty: '이 시나리오를 검증하는 테스트 없음',
    apis: resolveApis(record.steps.flatMap((step) => step.apis)),
    related: [inArchitecture(scenarioNodeIds(record))],
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
    docsEmpty: '이 프로젝트가 담당한 시나리오 단계가 인용한 문서 없음',
    tests: catalog.tests.filter((test) => test.source.path.startsWith(`${record.root}/`)),
    testsEmpty: '시나리오 근거로 인용된 이 프로젝트의 테스트 없음',
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
    facts: [
      { term: '주제', details: [record.topic] },
      { term: '인용한 시나리오', details: citing.map((scenario) => scenario.title) },
    ],
    source: [{ path: record.path }],
    sourceEmpty: '',
    docs: [],
    docsEmpty: '문서 자체임',
    tests: [],
    testsEmpty: '문서는 테스트 대상 아님',
  };
};

const inspectRecord = (entity: Extract<Entity, { section: 'records' }>): Inspection => {
  const { record } = entity;
  return {
    kind: '기록',
    title: record.title,
    facts: [
      { term: '종류', details: [RECORD_KIND[record.kind]] },
      { term: '날짜', details: [record.date] },
      { term: '요약', details: [record.summary] },
    ],
    source: [{ path: record.path }, ...record.sources],
    sourceEmpty: '',
    docs: resolveDocs(record.docs),
    docsEmpty: '이 기록이 정한 것을 담은 문서 없음',
    tests: catalog.tests.filter((test) => record.tests.includes(test.id)),
    testsEmpty: 'devhub 자체 테스트는 카탈로그에 없음. 확인 방법은 본문의 검증 절 참고',
  };
};

const apiLabel = new Map(catalog.apis.map((api) => [api.id, `${api.method} ${api.path}`]));
const contractLabel = new Map(
  catalog.contracts.map((contract) => [contract.id, `${contract.name} (${contract.owner})`]),
);
const scenarioTitle = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario.title]));

/** 시나리오의 한 단계. 흐름 뷰어에서 고른 것이다. */
const stepPager = (scenario: Scenario, step: ScenarioStep) =>
  pagerOf(
    '단계',
    scenario.steps.map((s) => ({ id: s.id, label: s.intent, href: stepHref(scenario.id, s.id) })),
    step.id,
  );

/** 아키텍처 목록이 보여 주는 순서의 노드들. */
const nodeOrder = (current: string): NodeOrder => ({
  current,
  nodes: architectureModel().nodes.map(({ id, label, href, nodeKind }) => ({
    id,
    label,
    href,
    kind: nodeKind,
  })),
});

export const inspectStep = (scenario: Scenario, step: ScenarioStep): Inspection => {
  const intentOf = new Map(scenario.steps.map((s) => [s.id, s.intent]));
  return {
    pager: stepPager(scenario, step),
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
    sourceEmpty: '이 단계에는 코드 없음. 부재 검색이 근거',
    docs: resolveDocs(step.docs),
    docsEmpty: '이 단계가 직접 인용한 문서 없음',
    tests: resolveTests(step.tests),
    testsEmpty: '이 단계를 직접 검증하는 테스트 없음',
    apis: resolveApis(step.apis),
    related: [inArchitecture(stepNodeIds(step))],
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

/** 아키텍처 뷰의 노드 하나. 역할 · 경계 · 관계와 이 노드를 지나는 단계들이다. */
export const inspectNode = (node: ArchitectureNode): Inspection => {
  const project = node.kind !== 'external';
  return {
    nodeOrder: nodeOrder(node.id),
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
      { term: '관계', details: relationsOf(node.id).map((r) => relationLink(node.id, r)) },
      ...(node.standalone ? [{ term: '관계 없음', details: [node.standalone] }] : []),
    ],
    source: project ? [{ path: node.root }, node.manifest] : node.evidence,
    sourceEmpty: '근거 source 없음',
    docs: resolveDocs([
      ...node.docs,
      ...boundariesOf(node.id).flatMap((boundary) => boundary.docs),
    ]),
    docsEmpty: '이 구성 요소를 설명하는 문서 없음',
    tests: project
      ? catalog.tests.filter((test) => test.source.path.startsWith(`${node.root}/`))
      : [],
    testsEmpty: project
      ? '시나리오 근거로 인용된 이 프로젝트의 테스트 없음'
      : '저장소 밖 시스템. 이를 부르는 쪽의 테스트는 관련 시나리오 단계에 있음',
    related: [
      touchingSteps(node.id),
      { title: '프로젝트 상세', links: projectPage(node), empty: '저장소 밖 시스템' },
    ],
  };
};

/** 인용된 저장소 파일 하나. 어디에 쓰이는지와 그 파일의 테스트 · API다. */
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
    docsEmpty: '이 파일을 인용한 단계가 인용한 문서 없음',
    tests: usage.tests,
    testsEmpty: '이 파일에 정의된, 근거로 인용된 테스트 없음',
    apis: usage.apis,
    related: [
      {
        title: '이 파일을 인용한 시나리오 단계',
        links: usage.steps.map(({ scenario, step }) => ({
          label: step.intent,
          href: stepHref(scenario.id, step.id),
          detail: scenario.title,
        })),
        empty: '인용한 시나리오 단계 없음',
      },
      inArchitecture([
        ...new Set([...(project ? [project] : []), ...usage.nodes.map((n) => n.id)]),
      ]),
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
    case 'records':
      return inspectRecord(entity);
  }
};
