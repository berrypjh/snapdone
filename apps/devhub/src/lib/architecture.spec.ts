import { describe, expect, it } from 'vitest';

import { catalog } from '../data';
import { headingPattern, read } from '../test-support/repository-files';

import { boundariesOf, stepNodeIds, stepsTouching } from './architecture';
import { ARCH_NODE, architectureModel, positionedIds, positionOf } from './architecture-layout';

const model = architectureModel();
const nodeIds = new Set(catalog.nodes.map((node) => node.id));
const documentPath = new Map(catalog.documents.map((doc) => [doc.id, doc.path]));

/** `M x y Q cx cy ex ey` 경로 위의 점들. */
const samples = (path: string) => {
  const [sx, sy, cx, cy, ex, ey] = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    return {
      x: (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * ex,
      y: (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * ey,
    };
  });
};

describe('architecture nodes', () => {
  it('position exactly the catalog nodes, without overlap', () => {
    expect(positionedIds().sort()).toEqual([...nodeIds].sort());
    const boxes = model.nodes;
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart =
          a.x + ARCH_NODE.width <= b.x ||
          b.x + ARCH_NODE.width <= a.x ||
          a.y + ARCH_NODE.height <= b.y ||
          b.y + ARCH_NODE.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('leave a node without relations only when it says why', () => {
    for (const node of catalog.nodes) {
      const related = catalog.relations.some((r) => r.from === node.id || r.to === node.id);
      expect({ id: node.id, related }).toEqual({ id: node.id, related: !node.standalone });
    }
  });

  it('back external systems with source evidence', () => {
    for (const node of catalog.nodes) {
      if (node.kind === 'external') expect(node.evidence.length).toBeGreaterThan(0);
    }
  });

  it('link documented-by headings that exist', () => {
    const links = [
      ...catalog.nodes.flatMap((node) => node.docs),
      ...catalog.boundaries.flatMap((b) => b.docs),
    ];
    const missing = links.filter(
      (link) =>
        !documentPath.has(link.document) ||
        (link.heading &&
          !headingPattern(link.heading).test(read(String(documentPath.get(link.document))))),
    );
    expect(missing).toEqual([]);
  });
});

describe('architecture edges', () => {
  it('draw every relation between positioned endpoints', () => {
    expect(model.edges.map((edge) => edge.id).sort()).toEqual(
      catalog.relations.map((relation) => relation.id).sort(),
    );
  });

  it('never pass under a node that is not one of their ends', () => {
    const crossings = catalog.relations.flatMap((relation) => {
      const edge = model.edges.find((e) => e.id === relation.id);
      if (!edge) return [];
      return model.nodes
        .filter((node) => node.id !== relation.from && node.id !== relation.to)
        .filter((node) =>
          samples(edge.path).some(
            (p) =>
              p.x > node.x + 4 &&
              p.x < node.x + ARCH_NODE.width - 4 &&
              p.y > node.y + 4 &&
              p.y < node.y + ARCH_NODE.height - 4,
          ),
        )
        .map((node) => `${relation.id} under ${node.id}`);
    });
    expect(crossings).toEqual([]);
  });

  it('name boundaries after relations that exist', () => {
    const relationIds = new Set(catalog.relations.map((relation) => relation.id));
    for (const boundary of catalog.boundaries) {
      expect(boundary.relations.filter((id) => !relationIds.has(id))).toEqual([]);
    }
    expect(boundariesOf('web').map((b) => b.id)).toEqual(['webview', 'api', 'auth']);
  });
});

describe('scenario ↔ architecture', () => {
  const steps = catalog.scenarios.flatMap((scenario) =>
    scenario.steps.map((step) => ({ scenario, step })),
  );

  it('derive only node ids that exist', () => {
    const unknown = steps.flatMap(({ step }) => stepNodeIds(step).filter((id) => !nodeIds.has(id)));
    expect(unknown).toEqual([]);
  });

  it('find every step again from each node it touches', () => {
    for (const { scenario, step } of steps) {
      for (const id of stepNodeIds(step)) {
        expect(
          stepsTouching(id).some((r) => r.scenario.id === scenario.id && r.step.id === step.id),
        ).toBe(true);
      }
    }
  });

  it('put a handoff step on both the app and the API', () => {
    const handoff = catalog.scenarios.find((s) => s.id === 'webview-auth-handoff');
    const request = handoff?.steps.find((s) => s.id === 'request-code');
    expect(request && stepNodeIds(request)).toEqual(['mobile', 'api', 'webview-bridge']);
  });

  it('positions nodes on the curated grid', () => {
    expect(positionOf('web')).toEqual({ x: 340, y: 260 });
  });
});
