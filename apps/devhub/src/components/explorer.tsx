import Link from 'next/link';

import type { Scenario } from '@/domain/model';
import {
  type Entity,
  entityHref,
  entityStatus,
  type Section,
  sectionHref,
  SECTIONS,
} from '@/lib/entities';
import { TRACK } from '@/lib/labels';

import { Icon } from './icon';
import { NarrowDisclosure } from './narrow-disclosure';
import { StatusChip } from './status-chip';
import { SECTION_ICON, VIEW_ICON } from './view-icons';

type Selection = { section?: string; id?: string; view?: 'architecture' | 'source' };

const ITEM =
  'flex min-h-8 items-center justify-between gap-2 rounded-md px-2 py-1 typo-body-small text-text-default hover:bg-background-surface aria-[current=page]:bg-(--ds-background-selected) aria-[current=page]:typo-body-small-strong';

function ExplorerItem({ entity, selected }: { entity: Entity; selected: boolean }) {
  const status = entityStatus(entity);
  const code = entity.section === 'documents';
  return (
    <li>
      <Link href={entityHref(entity)} aria-current={selected ? 'page' : undefined} className={ITEM}>
        <span className={code ? 'devhub-code min-w-0' : 'min-w-0'}>{entity.label}</span>
        {status && <StatusChip status={status} />}
      </Link>
    </li>
  );
}

function ItemList({ entities, selection }: { entities: Entity[]; selection: Selection }) {
  return (
    <ul className="flex flex-col gap-px">
      {entities.map((entity) => (
        <ExplorerItem
          key={entity.id}
          entity={entity}
          selected={selection.section === entity.section && selection.id === entity.id}
        />
      ))}
    </ul>
  );
}

/** Scenarios split by track so product targets never sit among current behaviour. */
function ScenarioGroups({ section, selection }: { section: Section; selection: Selection }) {
  const tracks: Scenario['track'][] = ['current', 'product-target'];
  return tracks.map((track) => {
    const entities = section.entities.filter(
      (entity) => entity.section === 'scenarios' && entity.record.track === track,
    );
    return (
      <div key={track} className="flex flex-col gap-1">
        <h3 className="px-2 typo-caption-small text-text-light">{TRACK[track]}</h3>
        <ItemList entities={entities} selection={selection} />
      </div>
    );
  });
}

function ExplorerSection({ section, selection }: { section: Section; selection: Selection }) {
  const headingId = `explorer-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1 py-4 last:pb-0">
      <h2 id={headingId} className="flex items-center justify-between px-2">
        <Link
          href={sectionHref(section.id)}
          aria-current={selection.section === section.id && !selection.id ? 'page' : undefined}
          className="inline-flex items-center gap-1.5 typo-body-small-strong text-text-default hover:underline"
        >
          <Icon name={SECTION_ICON[section.id]} className="text-text-light" />
          {section.title}
        </Link>
        <span className="typo-caption-small text-text-light">{section.entities.length}</span>
      </h2>
      {section.id === 'scenarios' ? (
        <ScenarioGroups section={section} selection={selection} />
      ) : (
        <ItemList entities={section.entities} selection={selection} />
      )}
    </section>
  );
}

/** Left pane: every catalog entity, grouped by section, with a rule between sections. */
export function Explorer({ selection }: { selection: Selection }) {
  return (
    <aside
      aria-label="탐색기"
      className="relative border-b border-stroke-light bg-background-default lg:overflow-y-auto lg:border-r lg:border-b-0"
    >
      <NarrowDisclosure id="explorer-items" label="탐색기">
        <nav aria-label="저장소 항목" className="flex flex-col divide-y divide-stroke-light p-3">
          <div className="flex flex-col gap-px pb-4">
            <Link
              href="/"
              aria-current={!selection.section && !selection.view ? 'page' : undefined}
              className={ITEM}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name={VIEW_ICON.overview} className="text-text-light" />
                개요
              </span>
            </Link>
            <Link
              href="/architecture"
              aria-current={selection.view === 'architecture' ? 'page' : undefined}
              className={ITEM}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name={VIEW_ICON.architecture} className="text-text-light" />
                아키텍처
              </span>
            </Link>
          </div>
          {SECTIONS.map((section) => (
            <ExplorerSection key={section.id} section={section} selection={selection} />
          ))}
        </nav>
      </NarrowDisclosure>
    </aside>
  );
}
