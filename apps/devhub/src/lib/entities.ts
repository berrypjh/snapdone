import { catalog } from '../data';
import type {
  ApplicationRef,
  CommandGroup,
  CommandRef,
  DocumentRef,
  ImplementationStatus,
  LibraryRef,
  RecordRef,
  Scenario,
} from '../domain/model';

import { COMMAND_GROUP } from './labels';

/** 탐색기 섹션. 모든 항목은 카탈로그에서 만들어지고 손으로 적은 목록은 없다. */
export type SectionId =
  'scenarios' | 'applications' | 'libraries' | 'documents' | 'records' | 'engineering';

export type Entity =
  | { section: 'scenarios'; id: string; label: string; record: Scenario }
  | { section: 'applications'; id: string; label: string; record: ApplicationRef }
  | { section: 'libraries'; id: string; label: string; record: LibraryRef }
  | { section: 'documents'; id: string; label: string; record: DocumentRef }
  | { section: 'records'; id: string; label: string; record: RecordRef }
  | { section: 'engineering'; id: string; label: string; record: CommandGroupEntry };

/** 목적이 같은 명령 묶음. 엔지니어링은 묶음을 늘어놓고 그 안에 명령을 둔다. */
export type CommandGroupEntry = {
  id: CommandGroup;
  title: string;
  summary: string;
  commands: CommandRef[];
};

export const COMMAND_GROUPS: CommandGroupEntry[] = (
  Object.keys(COMMAND_GROUP) as CommandGroup[]
).map((id) => ({
  id,
  ...COMMAND_GROUP[id],
  commands: catalog.commands.filter((c) => c.group === id),
}));

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
    entities: catalog.scenarios.map((record) => ({
      section: 'scenarios',
      id: record.id,
      label: record.title,
      record,
    })),
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
    entities: catalog.documents.map((record) => ({
      section: 'documents',
      id: record.id,
      label: record.path,
      record,
    })),
  },
  {
    id: 'records',
    title: '기록',
    entities: RECORDS_NEWEST_FIRST.map((record) => ({
      section: 'records',
      id: record.id,
      label: record.title,
      record,
    })),
  },
  {
    id: 'engineering',
    title: '엔지니어링',
    entities: COMMAND_GROUPS.map((record) => ({
      section: 'engineering',
      id: record.id,
      label: record.title,
      record,
    })),
  },
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

/** 명령은 자기 페이지가 없다. 묶음 페이지 위의 카드 한 장이다. */
export const commandHref = (command: CommandRef) =>
  `/engineering/${command.group}#command-${command.id}`;

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
