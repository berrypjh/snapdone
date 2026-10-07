import { catalog } from '../../data';
import type { ArchitectureNode, ImplementationStatus, Scenario } from '../../domain/model';

import { STATUS, TRACK } from './labels';

/**
 * URL 쿼리(`?status=…&runtime=…`)에 담는 화면 필터. 값은 카탈로그와 대조하고,
 * 모르는 값은 믿지 않고 무시한다.
 */

type Params = Record<string, string | string[] | undefined>;

export type FilterOption = { value: string; label: string };
export type FilterGroup = { param: string; label: string; options: FilterOption[] };
export type ActiveFilters = Record<string, string | undefined>;

const pick = (params: Params, param: string, allowed: string[]) => {
  const value = params[param];
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
};

/** 필터 하나만 바꾼 같은 화면으로 가는 링크. `value`가 undefined면 그 필터를 푼다. */
export const filterHref = (
  basePath: string,
  active: ActiveFilters,
  param: string,
  value: string | undefined,
) => {
  const query = new URLSearchParams(
    Object.entries({ ...active, [param]: value })
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
  return query ? `${basePath}?${query}` : basePath;
};

const statusesInUse = [...new Set(catalog.scenarios.map((s) => s.status))];
const runtimesInUse = catalog.runtimes.filter((runtime) =>
  catalog.scenarios.some((s) => s.steps.some((step) => step.runtime === runtime.id)),
);
const tracks: Scenario['track'][] = ['current', 'developer'];

export const SCENARIO_FILTERS: FilterGroup[] = [
  {
    param: 'track',
    label: '구분',
    options: tracks.map((track) => ({ value: track, label: TRACK[track] })),
  },
  {
    param: 'status',
    label: '상태',
    options: statusesInUse.map((status) => ({ value: status, label: STATUS[status].label })),
  },
  {
    param: 'runtime',
    label: '런타임',
    options: runtimesInUse.map((runtime) => ({ value: runtime.id, label: runtime.name })),
  },
];

export const parseScenarioFilters = (params: Params): ActiveFilters =>
  Object.fromEntries(
    SCENARIO_FILTERS.map((group) => [
      group.param,
      pick(
        params,
        group.param,
        group.options.map((option) => option.value),
      ),
    ]),
  );

export const filterScenarios = (scenarios: Scenario[], active: ActiveFilters): Scenario[] =>
  scenarios.filter(
    (scenario) =>
      (!active.track || scenario.track === active.track) &&
      (!active.status || scenario.status === (active.status as ImplementationStatus)) &&
      (!active.runtime || scenario.steps.some((step) => step.runtime === active.runtime)),
  );

const NODE_KINDS: { value: ArchitectureNode['kind']; label: string }[] = [
  { value: 'application', label: '애플리케이션' },
  { value: 'library', label: '라이브러리' },
  { value: 'external', label: '외부' },
];

export const ARCHITECTURE_FILTERS: FilterGroup[] = [
  { param: 'kind', label: '종류', options: NODE_KINDS },
];

export const parseArchitectureFilters = (params: Params): ActiveFilters => ({
  kind: pick(
    params,
    'kind',
    NODE_KINDS.map((kind) => kind.value),
  ),
});
