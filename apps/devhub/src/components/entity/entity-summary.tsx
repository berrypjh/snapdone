import Link from 'next/link';

import { DocumentColumn, DocumentHead, RecordMeta, WorkspaceSection } from '@berrypjh/devhub-ui';

import { catalog } from '@/data';
import { architectureModel, neighborhoodModel } from '@/lib/catalog/architecture-layout';
import { type Entity, entityHref } from '@/lib/catalog/entities';
import { flowModel } from '@/lib/catalog/flow';
import { RECORD_KIND, RELATION } from '@/lib/catalog/labels';

import { ArchitectureMap } from '../architecture/architecture-map';
import { DocumentLayout } from '../doc/document-layout';
import { ScenarioViews } from '../flow/scenario-views';
import { SourceActions } from '../source/source-actions';

const LIST_ID = 'entity-list';

function ProjectRelations({ id }: { id: string }) {
  const relations = catalog.relations.filter((r) => r.from === id || r.to === id);
  if (relations.length === 0) {
    return (
      <p className="typo-body-small text-text-light">관계 없음 — 다른 프로젝트와 연결되지 않음</p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-stroke-light">
      {relations.map((relation) => (
        <li key={relation.id} className="flex flex-col gap-1 py-2">
          <p className="devhub-code">
            {relation.from} → {relation.to}
          </p>
          <p className="typo-caption-small text-text-light">
            {RELATION[relation.kind]}
            {relation.kind === 'runtime' && ` · ${relation.interaction} · ${relation.summary}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 이 프로젝트와 선으로 이어진 구성 요소만 그린 그림. 이어진 것이 없으면 그리지 않는다. */
function RelationMap({ id }: { id: string }) {
  const model = neighborhoodModel(architectureModel(), id);
  if (model.edges.length === 0) return null;
  return <ArchitectureMap model={model} focus={id} />;
}

function CitingScenarios({ documentId }: { documentId: string }) {
  const citing = catalog.scenarios.filter((scenario) =>
    [...scenario.docs, ...scenario.steps.flatMap((step) => step.docs)].some(
      (link) => link.document === documentId,
    ),
  );
  if (citing.length === 0) {
    return <p className="typo-body-small text-text-light">이 문서를 인용한 시나리오 없음</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {citing.map((scenario) => (
        <li key={scenario.id}>
          <Link
            href={entityHref({ section: 'scenarios', id: scenario.id })}
            className="typo-body-small text-text-link underline-offset-2 hover:underline"
          >
            {scenario.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * 개체 하나의 가운데 요약. 시나리오는 흐름 그림이나 목록으로 읽고, 프로젝트는 이웃 관계 그림과
 * 목록으로 읽는다. 목록이 정본이고 그림은 같은 내용을 보조로 보인다.
 */
export function EntitySummary({ entity }: { entity: Entity }) {
  switch (entity.section) {
    case 'scenarios':
      return (
        <>
          <p className="typo-body-small">{entity.record.goal}</p>
          <WorkspaceSection id={LIST_ID} title={`단계 ${entity.record.steps.length}개`}>
            <ScenarioViews scenario={entity.record} model={flowModel(entity.record)} />
          </WorkspaceSection>
        </>
      );
    case 'applications':
    case 'libraries':
      return (
        <>
          <p className="typo-body-small">{entity.record.summary}</p>
          <RelationMap id={entity.id} />
          <WorkspaceSection id={LIST_ID} title="관계">
            <ProjectRelations id={entity.id} />
          </WorkspaceSection>
        </>
      );
    case 'documents':
      return (
        <DocumentColumn>
          <DocumentHead>
            <SourceActions source={{ path: entity.record.path }} />
          </DocumentHead>
          <DocumentLayout doc={entity.record} />
          <WorkspaceSection id={LIST_ID} title="이 문서를 인용한 시나리오">
            <CitingScenarios documentId={entity.id} />
          </WorkspaceSection>
        </DocumentColumn>
      );
    case 'records':
      return (
        <DocumentColumn>
          <DocumentHead>
            <SourceActions
              source={{ path: entity.record.path }}
              lead={<RecordMeta date={entity.record.date} kind={RECORD_KIND[entity.record.kind]} />}
            />
          </DocumentHead>
          <DocumentLayout doc={entity.record} />
        </DocumentColumn>
      );
  }
}
