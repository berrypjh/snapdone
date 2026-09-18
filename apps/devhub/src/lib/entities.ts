import { catalog } from '../data';
import type {
  ApplicationRef,
  CommandGroup,
  CommandRef,
  DocumentRef,
  ImplementationStatus,
  LibraryRef,
  Scenario,
} from '../domain/model';

import { COMMAND_GROUP } from './labels';

/** Explorer sections. Every entry is generated from the catalog; nothing here is hand-listed. */
export type SectionId = 'scenarios' | 'applications' | 'libraries' | 'documents' | 'engineering';

export type Entity =
  | { section: 'scenarios'; id: string; label: string; record: Scenario }
  | { section: 'applications'; id: string; label: string; record: ApplicationRef }
  | { section: 'libraries'; id: string; label: string; record: LibraryRef }
  | { section: 'documents'; id: string; label: string; record: DocumentRef }
  | { section: 'engineering'; id: string; label: string; record: CommandGroupEntry };

/** A group of commands with the same purpose. Engineering lists groups, and commands inside. */
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

/** Route params of every entity page, for `generateStaticParams`. */
export const entityParams = () =>
  SECTIONS.flatMap((section) =>
    section.entities.map((entity) => ({ section: section.id, id: entity.id })),
  );

/** Route params of every scenario step page, for `generateStaticParams`. */
export const stepParams = () =>
  catalog.scenarios.flatMap((scenario) =>
    scenario.steps.map((step) => ({ section: 'scenarios', id: scenario.id, stepId: step.id })),
  );

export const sectionHref = (section: SectionId) => `/${section}`;

export const entityHref = (entity: Pick<Entity, 'section' | 'id'>) =>
  `/${entity.section}/${entity.id}`;

/** A command has no page of its own: it is a card on its group's page. */
export const commandHref = (command: CommandRef) =>
  `/engineering/${command.group}#command-${command.id}`;

/** Only scenarios carry an implementation status. */
export const entityStatus = (entity: Entity): ImplementationStatus | undefined =>
  entity.section === 'scenarios' ? entity.record.status : undefined;

/** Deep link to one step of a scenario (devhub.md 20.4). */
export const stepHref = (scenarioId: string, stepId: string) =>
  `/scenarios/${scenarioId}/steps/${stepId}`;

export const findStep = (scenarioId: string, stepId: string) => {
  const scenario = catalog.scenarios.find((s) => s.id === scenarioId);
  const step = scenario?.steps.find((s) => s.id === stepId);
  return scenario && step ? { scenario, step } : undefined;
};
