import { catalog } from '../data';
import type { ImplementationStatus, Scenario, ScenarioStep } from '../domain/model';

import { stepHref } from './entities';

/**
 * 시나리오를 그리는 좌표. 그릴 때마다 정리된 데이터에서 계산하고 저장하지 않는다.
 * 레인은 시나리오가 실제로 거치는 런타임이고, 열은 `next`를 따른다.
 */

export const NODE = { width: 232, height: 148 } as const;
const GAP_X = 56;
const GAP_Y = 16;
const LANE_PADDING = 20;
const LABEL_WIDTH = 136;
const LOOP_DEPTH = 44;

/** 사용자와 맞닿은 런타임이 앞, 서버가 끝. 모르는 런타임은 이 뒤에 온다. */
const RUNTIME_ORDER = [
  'browser',
  'system-auth-browser',
  'mobile-app',
  'mobile-webview',
  'next-server',
  'go-api',
];

export type FlowLane = { id: string; name: string; y: number; height: number };

export type FlowNode = {
  id: string;
  href: string;
  order: number;
  x: number;
  y: number;
  intent: string;
  status: ImplementationStatus;
  runtime: string;
  owner: string;
  /** 첫 소스 경로를 줄인 것. 전체 목록은 인스펙터가 갖고 있다. */
  source: string | null;
  sourceCount: number;
  apiCount: number;
  contractCount: number;
  testCount: number;
  via: string[];
};

export type FlowEdge = { id: string; from: string; to: string; back: boolean; path: string };

export type FlowModel = {
  width: number;
  height: number;
  lanes: FlowLane[];
  nodes: FlowNode[];
  edges: FlowEdge[];
};

const runtimeName = new Map(catalog.runtimes.map((runtime) => [runtime.id, runtime.name]));
const scenarioTitle = new Map(catalog.scenarios.map((scenario) => [scenario.id, scenario.title]));

/** `apps/web/src/lib/auth/handoff.ts` → `…/auth/handoff.ts`. */
export const shortPath = (path: string) => {
  const parts = path.split('/');
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path;
};

/**
 * 각 단계의 열. 앞선 단계가 가리키지 않으면 0이고, 아니면 그 단계로 이어지는 가장 깊은
 * 앞선 단계보다 하나 뒤다. 앞선 단계로 가는 선은 되돌이라서 깊이를 더하지 않는다.
 */
const columnsOf = (steps: ScenarioStep[]) => {
  const index = new Map(steps.map((step, i) => [step.id, i]));
  const column = new Map<string, number>();
  for (const step of steps) column.set(step.id, 0);
  for (const step of steps) {
    for (const target of step.next) {
      if ((index.get(target) ?? -1) <= (index.get(step.id) ?? 0)) continue;
      column.set(target, Math.max(column.get(target) ?? 0, (column.get(step.id) ?? 0) + 1));
    }
  }
  return column;
};

const laneOrder = (runtime: string) => {
  const i = RUNTIME_ORDER.indexOf(runtime);
  return i === -1 ? RUNTIME_ORDER.length : i;
};

const edgePath = (from: FlowNode, to: FlowNode, back: boolean) => {
  if (back) {
    const sx = from.x + NODE.width / 2;
    const tx = to.x + NODE.width / 2;
    const sy = from.y + NODE.height;
    const ty = to.y + NODE.height;
    const low = Math.max(sy, ty) + LOOP_DEPTH;
    return `M ${sx} ${sy} C ${sx} ${low}, ${tx} ${low}, ${tx} ${ty}`;
  }
  const sx = from.x + NODE.width;
  const sy = from.y + NODE.height / 2;
  const tx = to.x;
  const ty = to.y + NODE.height / 2;
  const bend = Math.max(24, (tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
};

export const flowModel = (scenario: Scenario): FlowModel => {
  const { steps } = scenario;
  const column = columnsOf(steps);
  const runtimes = [...new Set(steps.map((step) => step.runtime))].sort(
    (a, b) => laneOrder(a) - laneOrder(b),
  );

  // 레인과 열이 같은 단계들은 그 레인 안에서 세로로 쌓인다.
  const slot = new Map<string, number>();
  const stackDepth = new Map<string, number>();
  for (const step of steps) {
    const cell = `${step.runtime}:${column.get(step.id)}`;
    const depth = stackDepth.get(cell) ?? 0;
    slot.set(step.id, depth);
    stackDepth.set(cell, depth + 1);
  }
  const rows = (runtime: string) =>
    Math.max(
      ...[...stackDepth].filter(([cell]) => cell.startsWith(`${runtime}:`)).map(([, n]) => n),
    );

  let y = 0;
  const lanes: FlowLane[] = runtimes.map((id) => {
    const height = LANE_PADDING * 2 + rows(id) * NODE.height + (rows(id) - 1) * GAP_Y + LOOP_DEPTH;
    const lane = { id, name: runtimeName.get(id) ?? id, y, height };
    y += height;
    return lane;
  });
  const laneY = new Map(lanes.map((lane) => [lane.id, lane.y]));

  const nodes: FlowNode[] = steps.map((step, order) => ({
    id: step.id,
    href: stepHref(scenario.id, step.id),
    order: order + 1,
    x: LABEL_WIDTH + (column.get(step.id) ?? 0) * (NODE.width + GAP_X),
    y:
      (laneY.get(step.runtime) ?? 0) +
      LANE_PADDING +
      (slot.get(step.id) ?? 0) * (NODE.height + GAP_Y),
    intent: step.intent,
    status: step.status,
    runtime: runtimeName.get(step.runtime) ?? step.runtime,
    owner: step.owner,
    source: step.source[0] ? shortPath(step.source[0].path) : null,
    sourceCount: step.source.length,
    apiCount: step.apis.length,
    contractCount: step.contracts.length,
    testCount: step.tests.length,
    via: (step.via ?? []).map((id) => scenarioTitle.get(id) ?? id),
  }));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const position = new Map(steps.map((step, i) => [step.id, i]));
  const edges: FlowEdge[] = steps.flatMap((step) =>
    step.next.flatMap((target) => {
      const from = nodeById.get(step.id);
      const to = nodeById.get(target);
      if (!from || !to) return [];
      const back = (position.get(target) ?? 0) <= (position.get(step.id) ?? 0);
      return [
        {
          id: `${step.id}->${target}`,
          from: step.id,
          to: target,
          back,
          path: edgePath(from, to, back),
        },
      ];
    }),
  );

  const columns = Math.max(...nodes.map((node) => column.get(node.id) ?? 0)) + 1;
  return {
    width: LABEL_WIDTH + columns * (NODE.width + GAP_X),
    height: y,
    lanes,
    nodes,
    edges,
  };
};
