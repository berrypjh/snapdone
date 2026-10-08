import Link from 'next/link';

import { DocumentColumn, DocumentHead, RecordMeta, WorkspaceSection } from '@berrypjh/devhub-ui';

import { catalog } from '@/data';
import { type Entity, entityHref } from '@/lib/catalog/entities';
import { flowModel } from '@/lib/catalog/flow';
import { RECORD_KIND, RELATION } from '@/lib/catalog/labels';

import { DocumentLayout } from '../doc/document-layout';
import { ScenarioViews } from '../flow/scenario-views';
import { DiagramPlaceholder } from '../shell/workspace';
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
 * 개체 하나의 가운데 요약. 시나리오는 흐름 그림이나 목록으로 읽고, 나머지 개체는 목록만 있으며
 * 그림 자리는 아직 비어 있다.
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
          <DiagramPlaceholder listId={LIST_ID} />
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
