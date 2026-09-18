import Link from 'next/link';

import { catalog } from '@/data';
import type { Relation } from '@/domain/model';
import { architectureHref, findNode, nodeLabel } from '@/lib/architecture';
import { stepHref } from '@/lib/entities';
import { INTERACTION, RELATION } from '@/lib/labels';

import { StatusChip } from '../status-chip';
import { WorkspaceSection } from '../workspace';

const relationText = (relation: Relation) =>
  relation.kind === 'runtime' ? INTERACTION[relation.interaction] : RELATION[relation.kind];

const relationSummary = (relation: Relation) =>
  relation.kind === 'workspace-dependency'
    ? `${relation.declaredBy === 'implicit-dependency' ? 'implicitDependencies' : 'workspace:* 의존'} · ${relation.evidence.path}`
    : relation.summary;

function NodeLink({ id }: { id: string }) {
  const node = findNode(id);
  return (
    <Link
      href={architectureHref(id)}
      scroll={false}
      className="text-text-link underline-offset-2 hover:underline"
    >
      {node ? nodeLabel(node) : id}
    </Link>
  );
}

function RelationItem({ relation }: { relation: Relation }) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <p className="typo-body-small">
        <NodeLink id={relation.from} /> → <NodeLink id={relation.to} />
        <span className="text-text-light"> · {relationText(relation)}</span>
      </p>
      <p className="typo-caption-small text-text-light">{relationSummary(relation)}</p>
    </li>
  );
}

/** Boundaries a new developer should see first, each with the relations that cross it. */
export function BoundaryList() {
  return (
    <WorkspaceSection id="architecture-boundaries" title="경계">
      {catalog.boundaries.map((boundary) => (
        <section
          key={boundary.id}
          id={`boundary-${boundary.id}`}
          aria-labelledby={`boundary-${boundary.id}-heading`}
          className="flex flex-col gap-1"
        >
          <h3 id={`boundary-${boundary.id}-heading`} className="typo-body-small-strong">
            {boundary.name}
          </h3>
          <p className="typo-body-small">{boundary.summary}</p>
          <ul className="flex flex-col divide-y divide-stroke-light">
            {catalog.relations
              .filter((relation) => boundary.relations.includes(relation.id))
              .map((relation) => (
                <RelationItem key={relation.id} relation={relation} />
              ))}
          </ul>
        </section>
      ))}
    </WorkspaceSection>
  );
}

const KINDS: Relation['kind'][] = ['runtime', 'workspace-dependency', 'verification'];

/** Every relation as text, grouped so Nx edges and runtime calls never read as the same thing. */
export function RelationList() {
  return (
    <WorkspaceSection id="architecture-relations" title="관계 (정본 목록)">
      <p className="typo-caption-small text-text-light">
        Nx graph가 보는 것은 manifest에 선언된 의존뿐이다. 실행 중 호출과 검증은 Nx graph에 없고
        여기에서만 보인다.
      </p>
      {KINDS.map((kind) => {
        const relations = catalog.relations.filter((relation) => relation.kind === kind);
        return (
          <section key={kind} aria-labelledby={`relations-${kind}`} className="flex flex-col">
            <h3 id={`relations-${kind}`} className="typo-body-small-strong">
              {RELATION[kind]} {relations.length}
            </h3>
            <ul className="flex flex-col divide-y divide-stroke-light">
              {relations.map((relation) => (
                <RelationItem key={relation.id} relation={relation} />
              ))}
            </ul>
          </section>
        );
      })}
    </WorkspaceSection>
  );
}

/** Target-only parts, kept out of the drawing and listed as what they are. */
export function TargetOnlyList() {
  const targets = catalog.scenarios.filter((scenario) => scenario.track === 'product-target');
  return (
    <WorkspaceSection id="architecture-target" title="문서에만 있는 구성 — 그림에 없음">
      <p className="typo-caption-small text-text-light">
        아래 단계는 문서가 약속하지만 코드가 없다. 현재 아키텍처 그림에 node로 넣지 않았다.
      </p>
      {targets.map((scenario) => (
        <ul key={scenario.id} className="flex flex-col divide-y divide-stroke-light">
          {scenario.steps.map((step) => (
            <li key={step.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                href={stepHref(scenario.id, step.id)}
                className="typo-body-small text-text-link underline-offset-2 hover:underline"
              >
                {step.intent}
              </Link>
              <StatusChip status={step.status} />
            </li>
          ))}
        </ul>
      ))}
    </WorkspaceSection>
  );
}
