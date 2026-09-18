import { catalog } from '../data';
import type {
  ApplicationRef,
  ArchitectureNode,
  Boundary,
  LibraryRef,
  Scenario,
  ScenarioStep,
} from '../domain/model';

import { stepHref } from './entities';

/**
 * Links between scenario steps and architecture nodes, derived from data already curated:
 * nothing here is a second hand-written list.
 */

const projects = catalog.nodes.filter(
  (node): node is ApplicationRef | LibraryRef => node.kind !== 'external',
);
const apiHandlerPath = new Map(catalog.apis.map((api) => [api.id, api.handler.path]));
const contractOwner = new Map(catalog.contracts.map((contract) => [contract.id, contract.owner]));

export const architectureHref = (nodeId: string) => `/architecture/${nodeId}`;

export const findNode = (id: string): ArchitectureNode | undefined =>
  catalog.nodes.find((node) => node.id === id);

/** Route params of every architecture node page, for `generateStaticParams`. */
export const nodeParams = () => catalog.nodes.map((node) => ({ nodeId: node.id }));

export const nodeLabel = (node: ArchitectureNode) =>
  node.kind === 'external' ? node.name : node.id;

/** The project whose root contains `path`, if any. */
export const projectOf = (path: string) =>
  projects.find((project) => path === project.root || path.startsWith(`${project.root}/`))?.id;

/**
 * Nodes a step touches: its owner, the projects holding its source, the project serving its
 * APIs, and the libraries owning its contracts. In that order, without repeats.
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

/** Every scenario step that touches the node, in catalog order. */
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
