import { catalog } from '../../data';
import type {
  ApplicationRef,
  DocumentRef,
  ImplementationStatus,
  LibraryRef,
  RecordRef,
  Scenario,
} from '../../domain/model';

import { DOCUMENT_TOPIC, RECORD_KIND, TRACK } from './labels';

/** 탐색기 섹션. 모든 항목은 카탈로그에서 만들어지고 손으로 적은 목록은 없다. */
export type SectionId = 'scenarios' | 'applications' | 'libraries' | 'documents' | 'records';

type EntityBase = {
  id: string;
  label: string;
  /** 탐색기에서 접고 펴는 묶음의 제목. 없으면 섹션이 묶음 없이 한 목록이다. */
  group?: string;
};

export type Entity =
  | (EntityBase & { section: 'scenarios'; record: Scenario })
  | (EntityBase & { section: 'applications'; record: ApplicationRef })
  | (EntityBase & { section: 'libraries'; record: LibraryRef })
  | (EntityBase & { section: 'documents'; record: DocumentRef })
  | (EntityBase & { section: 'records'; record: RecordRef });

export type Section = { id: SectionId; title: string; entities: Entity[] };

/** 기록은 최신순으로 읽는다. 같은 날짜는 적힌 순서를 그대로 둔다. */
export const RECORDS_NEWEST_FIRST: RecordRef[] = [...catalog.records].sort((a, b) =>
  b.date.localeCompare(a.date),
);

const applications = catalog.nodes.filter(
  (node): node is ApplicationRef => node.kind === 'application',
);
const libraries = catalog.nodes.filter((node): node is LibraryRef => node.kind === 'library');

export const SECTIONS: Section[] = [
  {
    id: 'scenarios',
    title: '시나리오',
    entities: (Object.keys(TRACK) as Scenario['track'][]).flatMap((track) =>
      catalog.scenarios
        .filter((record) => record.track === track)
        .map((record) => ({
          section: 'scenarios' as const,
          id: record.id,
          label: record.title,
          group: TRACK[track],
          record,
        })),
    ),
  },
  {
    id: 'records',
    title: '기록',
    entities: (Object.keys(RECORD_KIND) as RecordRef['kind'][]).flatMap((kind) =>
      RECORDS_NEWEST_FIRST.filter((record) => record.kind === kind).map((record) => ({
        section: 'records' as const,
        id: record.id,
        label: record.title,
        group: RECORD_KIND[kind],
        record,
      })),
    ),
  },
  {
    id: 'applications',
    title: '애플리케이션',
    entities: applications.map((record) => ({
      section: 'applications',
      id: record.id,
      label: record.id,
      record,
    })),
  },
  {
    id: 'libraries',
    title: '라이브러리',
    entities: libraries.map((record) => ({
      section: 'libraries',
      id: record.id,
      label: record.id,
      record,
    })),
  },
  {
    id: 'documents',
    title: '문서',
    entities: (Object.keys(DOCUMENT_TOPIC) as DocumentRef['topic'][]).flatMap((topic) =>
      catalog.documents
        .filter((record) => record.topic === topic)
        .map((record) => ({
          section: 'documents' as const,
          id: record.id,
          label: record.path,
          group: DOCUMENT_TOPIC[topic],
          record,
        })),
    ),
  },
];

export type ViewId = 'overview' | 'architecture';

export type View = { id: ViewId; label: string; path: string };

/** 섹션이 없는 보기. 탐색기 맨 위에 이 순서로 선다. */
export const VIEWS: View[] = [
  { id: 'overview', label: '개요', path: '/' },
  { id: 'architecture', label: '아키텍처', path: '/architecture' },
];

export const findSection = (id: string): Section | undefined =>
  SECTIONS.find((section) => section.id === id);

export const findEntity = (sectionId: string, id: string): Entity | undefined =>
  findSection(sectionId)?.entities.find((entity) => entity.id === id);

/** 모든 엔티티 페이지의 라우트 파라미터. `generateStaticParams`용. */
export const entityParams = () =>
  SECTIONS.flatMap((section) =>
    section.entities.map((entity) => ({ section: section.id, id: entity.id })),
  );

/** 모든 시나리오 단계 페이지의 라우트 파라미터. `generateStaticParams`용. */
export const stepParams = () =>
  catalog.scenarios.flatMap((scenario) =>
    scenario.steps.map((step) => ({ section: 'scenarios', id: scenario.id, stepId: step.id })),
  );

export const sectionHref = (section: SectionId) => `/${section}`;

export const entityHref = (entity: Pick<Entity, 'section' | 'id'>) =>
  `/${entity.section}/${entity.id}`;

/** 구현 상태는 시나리오만 가진다. */
export const entityStatus = (entity: Entity): ImplementationStatus | undefined =>
  entity.section === 'scenarios' ? entity.record.status : undefined;

/** 시나리오의 한 단계로 바로 가는 링크 (devhub.md 20.4). */
export const stepHref = (scenarioId: string, stepId: string) =>
  `/scenarios/${scenarioId}/steps/${stepId}`;

export const findStep = (scenarioId: string, stepId: string) => {
  const scenario = catalog.scenarios.find((s) => s.id === scenarioId);
  const step = scenario?.steps.find((s) => s.id === stepId);
  return scenario && step ? { scenario, step } : undefined;
};
