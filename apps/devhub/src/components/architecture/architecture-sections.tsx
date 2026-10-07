import Link from 'next/link';

import { WorkspaceSection } from '@berrypjh/devhub-ui';

import { catalog } from '@/data';
import type { Relation } from '@/domain/model';
import { architectureHref, findNode, nodeLabel } from '@/lib/catalog/architecture';
import { INTERACTION, RELATION } from '@/lib/catalog/labels';

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
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 typo-body-small">
        <span>
          <NodeLink id={relation.from} /> → <NodeLink id={relation.to} />
        </span>
        <span className="rounded-sm bg-background-default px-1.5 typo-caption-small text-text-light">
          {relationText(relation)}
        </span>
      </p>
      <p className="typo-caption-small text-text-light">{relationSummary(relation)}</p>
    </li>
  );
}

/** 새로 온 사람이 먼저 봐야 할 경계들. 경계를 넘는 관계를 아래에 들여써 근거로 읽히게 한다. */
export function BoundaryList() {
  return (
    <WorkspaceSection id="architecture-boundaries" title="경계">
      <div className="flex flex-col divide-y divide-stroke-light">
        {catalog.boundaries.map((boundary) => (
          <section
            key={boundary.id}
            id={`boundary-${boundary.id}`}
            aria-labelledby={`boundary-${boundary.id}-heading`}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
          >
            <h3 id={`boundary-${boundary.id}-heading`} className="typo-body-small-strong">
              {boundary.name}
            </h3>
            <p className="typo-body-small">{boundary.summary}</p>
            <ul className="mt-1 flex flex-col divide-y divide-stroke-light border-l-2 border-stroke-light pl-3">
              {catalog.relations
                .filter((relation) => boundary.relations.includes(relation.id))
                .map((relation) => (
                  <RelationItem key={relation.id} relation={relation} />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </WorkspaceSection>
  );
}

const KINDS: Relation['kind'][] = ['runtime', 'workspace-dependency', 'verification'];

/** 모든 관계를 글로. Nx 의존과 실행 중 호출이 같은 것으로 읽히지 않게 묶어서 보인다. */
export function RelationList() {
  return (
    <WorkspaceSection id="architecture-relations" title="관계 (정본 목록)">
      <p className="typo-caption-small text-text-light">
        Nx graph가 보는 것은 manifest에 선언된 의존뿐. 실행 중 호출과 검증은 Nx graph에 없고
        여기에서만 보임
      </p>
      {KINDS.map((kind) => {
        const relations = catalog.relations.filter((relation) => relation.kind === kind);
        return (
          <section key={kind} aria-labelledby={`relations-${kind}`} className="flex flex-col">
            <h3 id={`relations-${kind}`} className="typo-body-small-strong">
              {RELATION[kind]}{' '}
              <span className="typo-caption-small text-text-light">{relations.length}</span>
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
