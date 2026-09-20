import { catalog } from '../../data';
import type {
  ApplicationRef,
  ArchitectureNode,
  Boundary,
  LibraryRef,
  Scenario,
  ScenarioStep,
} from '../../domain/model';

import { stepHref } from './entities';

/**
 * 시나리오 단계와 아키텍처 노드를 잇는다. 이미 정리된 데이터에서 끌어내며,
 * 손으로 적은 두 번째 목록은 여기에 없다.
 */

const projects = catalog.nodes.filter(
  (node): node is ApplicationRef | LibraryRef => node.kind !== 'external',
);
const apiHandlerPath = new Map(catalog.apis.map((api) => [api.id, api.handler.path]));
const contractOwner = new Map(catalog.contracts.map((contract) => [contract.id, contract.owner]));

export const architectureHref = (nodeId: string) => `/architecture/${nodeId}`;

export const findNode = (id: string): ArchitectureNode | undefined =>
  catalog.nodes.find((node) => node.id === id);

/** 모든 아키텍처 노드 페이지의 라우트 파라미터. `generateStaticParams`용. */
export const nodeParams = () => catalog.nodes.map((node) => ({ nodeId: node.id }));

export const nodeLabel = (node: ArchitectureNode) =>
  node.kind === 'external' ? node.name : node.id;

/** `path`를 루트에 품은 프로젝트. 없으면 undefined. */
export const projectOf = (path: string) =>
  projects.find((project) => path === project.root || path.startsWith(`${project.root}/`))?.id;

/**
 * 단계가 건드리는 노드들. 담당 프로젝트, 소스를 가진 프로젝트, API를 제공하는 프로젝트,
 * 계약을 소유한 라이브러리 순서이고 중복은 없다.
 */
export const stepNodeIds = (step: ScenarioStep): string[] => [
  ...new Set(
    [
      step.owner,
      ...step.source.map((ref) => projectOf(ref.path)),
      ...step.apis.map((id) => projectOf(apiHandlerPath.get(id) ?? '')),
      ...step.contracts.map((id) => contractOwner.get(id)),
    ].filter((id): id is string => id !== undefined),
  ),
];

export const scenarioNodeIds = (scenario: Scenario): string[] => [
  ...new Set(scenario.steps.flatMap(stepNodeIds)),
];

export type RelatedStep = { scenario: Scenario; step: ScenarioStep; href: string };

/** 이 노드를 건드리는 모든 시나리오 단계. 카탈로그 순서를 따른다. */
export const stepsTouching = (nodeId: string): RelatedStep[] =>
  catalog.scenarios.flatMap((scenario) =>
    scenario.steps
      .filter((step) => stepNodeIds(step).includes(nodeId))
      .map((step) => ({ scenario, step, href: stepHref(scenario.id, step.id) })),
  );

export const boundariesOf = (nodeId: string): Boundary[] =>
  catalog.boundaries.filter((boundary) =>
    catalog.relations.some(
      (relation) =>
        boundary.relations.includes(relation.id) &&
        (relation.from === nodeId || relation.to === nodeId),
    ),
  );
