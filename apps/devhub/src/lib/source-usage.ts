import { catalog } from '../data';
import type {
  ApiRef,
  ArchitectureNode,
  ContractRef,
  Relation,
  Scenario,
  ScenarioStep,
  TestRef,
} from '../domain/model';

/**
 * 카탈로그가 인용하는 모든 저장소 경로와 그것을 인용한 쪽. 데이터에서 끌어내므로
 * 따로 맞춰 둘 두 번째 목록이 없다.
 */
export type SourceUsage = {
  path: string;
  symbols: string[];
  steps: { scenario: Scenario; step: ScenarioStep }[];
  relations: Relation[];
  nodes: ArchitectureNode[];
  apis: ApiRef[];
  contracts: ContractRef[];
  tests: TestRef[];
};

const empty = (path: string): SourceUsage => ({
  path,
  symbols: [],
  steps: [],
  relations: [],
  nodes: [],
  apis: [],
  contracts: [],
  tests: [],
});

const pushOnce = <T>(list: T[], item: T) => {
  if (!list.includes(item)) list.push(item);
};

const collect = () => {
  const usage = new Map<string, SourceUsage>();
  const at = (path: string, symbol?: string) => {
    const entry = usage.get(path) ?? empty(path);
    usage.set(path, entry);
    if (symbol && !entry.symbols.includes(symbol)) entry.symbols.push(symbol);
    return entry;
  };

  for (const scenario of catalog.scenarios) {
    for (const step of scenario.steps) {
      for (const ref of step.source) {
        const { steps } = at(ref.path, ref.symbol);
        if (!steps.some((cited) => cited.step === step)) steps.push({ scenario, step });
      }
    }
  }
  for (const relation of catalog.relations) {
    const refs = relation.kind === 'workspace-dependency' ? [relation.evidence] : relation.evidence;
    for (const ref of refs) pushOnce(at(ref.path, ref.symbol).relations, relation);
  }
  for (const node of catalog.nodes) {
    const refs = node.kind === 'external' ? node.evidence : [node.manifest];
    for (const ref of refs) pushOnce(at(ref.path, ref.symbol).nodes, node);
  }
  for (const api of catalog.apis) pushOnce(at(api.handler.path, api.handler.symbol).apis, api);
  for (const contract of catalog.contracts) {
    pushOnce(at(contract.definedIn.path, contract.definedIn.symbol).contracts, contract);
  }
  for (const test of catalog.tests) pushOnce(at(test.source.path, test.source.symbol).tests, test);
  return usage;
};

let cache: Map<string, SourceUsage> | undefined;

export const sourceUsage = (): Map<string, SourceUsage> => (cache ??= collect());

export const sourceHref = (path: string) => `/source?path=${encodeURIComponent(path)}`;
