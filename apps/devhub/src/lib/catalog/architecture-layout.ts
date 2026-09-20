import { catalog } from '../../data';
import type { ArchitectureNode, Relation, RuntimeRelation } from '../../domain/model';

import { architectureHref, nodeLabel } from './architecture';
import { INTERACTION, RELATION, ROLE } from './labels';

/**
 * 아키텍처 뷰의 손으로 정한 위치다. 저장소 사실이 아니라 표현이다.
 * 격자는 열 × 300px, 행 × 220px. 선이 노드 밑을 지나지 않도록 골랐다.
 *
 *   row 0            web-e2e                              devhub   devhub-e2e
 *   row 1  browser   web              google-oidc
 *   row 2  webview-  (비어 있음: WebView  api           postgres
 *          bridge     선이 여기로 지난다)
 *   row 3  auth-     mobile                            image-model
 *          contracts
 *   row 4  onboarding (web의 선이 auth-contracts와 mobile 사이로 휜다)
 */
const GRID: Record<string, [column: number, row: number]> = {
  'web-e2e': [1, 0],
  devhub: [3, 0],
  'devhub-e2e': [4, 0],
  browser: [0, 1],
  web: [1, 1],
  'google-oidc': [2, 1],
  'webview-bridge': [0, 2],
  api: [2, 2],
  postgres: [3, 2],
  'auth-contracts': [0, 3],
  mobile: [1, 3],
  onboarding: [0, 4],
  'image-model': [3, 3],
};

/** 같은 두 노드를 잇는 관계의 휨 방향. 나란한 선이 겹치지 않게 한다. */
const BEND: Record<string, number> = {
  'mobile-hosts-web': -1,
  'web-messages-mobile': -1,
  'google-redirects-to-api': -1,
  'api-calls-google': -1,
  'web-e2e-depends-on-web': -1,
  'web-verified-by-web-e2e': -1,
  'devhub-e2e-depends-on-devhub': -1,
  'devhub-verified-by-devhub-e2e': -1,
  'mobile-opens-google': -0.5,
  'web-depends-on-onboarding': -0.5,
};

export const ARCH_NODE = { width: 208, height: 116 } as const;
const COLUMN = 300;
const ROW = 220;
const MARGIN = 40;
const BEND_PX = 56;

export type ArchNode = {
  id: string;
  href: string;
  label: string;
  /** 거르기에 쓰는 원래 노드 종류. `kind`는 화면에 보이는 이름이다. */
  nodeKind: ArchitectureNode['kind'];
  kind: string;
  summary: string;
  detail: string;
  x: number;
  y: number;
};

export type ArchEdge = {
  id: string;
  from: string;
  to: string;
  kind: Relation['kind'];
  interaction?: RuntimeRelation['interaction'];
  text: string;
  path: string;
  label: { x: number; y: number };
};

export type ArchitectureModel = {
  width: number;
  height: number;
  nodes: ArchNode[];
  edges: ArchEdge[];
};

export const positionOf = (id: string) => {
  const cell = GRID[id];
  return cell ? { x: MARGIN + cell[0] * COLUMN, y: MARGIN + cell[1] * ROW } : undefined;
};

export const positionedIds = () => Object.keys(GRID);

type Point = { x: number; y: number };

/** 상자 중심에서 `toward`로 향하는 선이 상자를 벗어나는 지점. */
export const boxAnchor = (center: Point, toward: Point): Point => {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = Math.min(
    dx === 0 ? Infinity : ARCH_NODE.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : ARCH_NODE.height / 2 / Math.abs(dy),
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
};

const centerOf = (id: string): Point | undefined => {
  const position = positionOf(id);
  return position && { x: position.x + ARCH_NODE.width / 2, y: position.y + ARCH_NODE.height / 2 };
};

/** 두 상자를 잇는 2차 곡선. `bend`만큼 옆으로 휘고, 이름표는 가운데에 둔다. */
export const edgeGeometry = (fromId: string, toId: string, bend = 0) => {
  const a = centerOf(fromId);
  const b = centerOf(toId);
  if (!a || !b) return undefined;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  const control = {
    x: (a.x + b.x) / 2 + normal.x * bend * BEND_PX * 2,
    y: (a.y + b.y) / 2 + normal.y * bend * BEND_PX * 2,
  };
  const start = boxAnchor(a, control);
  const end = boxAnchor(b, control);
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: {
      x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    },
  };
};

const edgeText = (relation: Relation) =>
  relation.kind === 'runtime' ? INTERACTION[relation.interaction] : RELATION[relation.kind];

const kindLabel = (node: (typeof catalog.nodes)[number]) =>
  node.kind === 'application'
    ? `애플리케이션 · ${ROLE[node.role]}`
    : node.kind === 'library'
      ? '라이브러리'
      : '외부';

export const architectureModel = (): ArchitectureModel => {
  const nodes: ArchNode[] = catalog.nodes.flatMap((node) => {
    const position = positionOf(node.id);
    if (!position) return [];
    return [
      {
        id: node.id,
        href: architectureHref(node.id),
        label: nodeLabel(node),
        nodeKind: node.kind,
        kind: kindLabel(node),
        summary: node.summary,
        detail: node.kind === 'external' ? '저장소 밖' : node.root,
        ...position,
      },
    ];
  });

  const edges: ArchEdge[] = catalog.relations.flatMap((relation) => {
    const geometry = edgeGeometry(relation.from, relation.to, BEND[relation.id] ?? 0);
    if (!geometry) return [];
    const interaction = relation.kind === 'runtime' ? relation.interaction : undefined;
    return [
      {
        id: relation.id,
        from: relation.from,
        to: relation.to,
        kind: relation.kind,
        interaction,
        text: edgeText(relation),
        ...geometry,
      },
    ];
  });

  const columns = Math.max(...Object.values(GRID).map(([column]) => column)) + 1;
  const rows = Math.max(...Object.values(GRID).map(([, row]) => row)) + 1;
  return {
    width: MARGIN * 2 + (columns - 1) * COLUMN + ARCH_NODE.width,
    height: MARGIN * 2 + (rows - 1) * ROW + ARCH_NODE.height,
    nodes,
    edges,
  };
};

/** 한 종류의 노드와 양 끝이 모두 남은 선만 남긴다. 종류가 없으면 전부 남긴다. */
export const filterModel = (model: ArchitectureModel, kind?: string): ArchitectureModel => {
  if (!kind) return model;
  const nodes = model.nodes.filter((node) => node.nodeKind === kind);
  const visible = new Set(nodes.map((node) => node.id));
  const edges = model.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
  return { ...model, nodes, edges };
};
