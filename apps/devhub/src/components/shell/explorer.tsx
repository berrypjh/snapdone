import Link from 'next/link';

import type { Scenario } from '@/domain/model';
import {
  type Entity,
  entityHref,
  entityStatus,
  type Section,
  sectionHref,
  SECTIONS,
} from '@/lib/catalog/entities';
import { TRACK } from '@/lib/catalog/labels';

import { StatusChip } from '../entity/status-chip';
import { Icon } from '../ui/icon';
import { SECTION_ICON, VIEW_ICON } from '../ui/view-icons';

import { ExplorerPane } from './explorer-drawer';

type Selection = { section?: string; id?: string; view?: 'architecture' | 'source' };

const ITEM =
  'flex min-h-8 items-center justify-between gap-2 rounded-md px-2 py-1 typo-body-small text-text-default hover:bg-background-default aria-[current=page]:bg-(--ds-background-selected) aria-[current=page]:typo-body-small-strong';

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

/** 시나리오를 트랙으로 나눈다. 제품 목표가 현재 동작 사이에 섞이지 않게 한다. */
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

/**
 * 왼쪽 창. 카탈로그의 모든 항목을 섹션으로 묶고 섹션 사이에 선을 둔다. `lg` 아래에서는 상단
 * 바에서 여는 서랍이 된다.
 */
export function Explorer({ selection }: { selection: Selection }) {
  return (
    <ExplorerPane>
      <nav
        aria-label="저장소 항목"
        className="flex flex-col divide-y divide-stroke-light p-3 pb-12"
      >
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
    </ExplorerPane>
  );
}
