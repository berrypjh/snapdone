import Link from 'next/link';

import type { RepositoryRef } from '@/domain/model';
import type { SectionId } from '@/lib/entities';

import { ExplorerToggle } from './explorer-drawer';
import { GlobalSearch } from './global-search';
import { Icon, type IconName } from './icon';
import { SnapshotSummary } from './snapshot-summary';
import { ThemeSwitch } from './theme-switch';
import { SECTION_ICON, VIEW_ICON } from './view-icons';

const PRODUCT_NAME = 'Snapdone DevHub';

const VIEWS: { label: string; href: string; icon: IconName; sections: SectionId[] }[] = [
  { label: '개요', href: '/', icon: VIEW_ICON.overview, sections: [] },
  { label: '시나리오', href: '/scenarios', icon: SECTION_ICON.scenarios, sections: ['scenarios'] },
  {
    label: '아키텍처',
    href: '/architecture',
    icon: VIEW_ICON.architecture,
    sections: ['applications', 'libraries'],
  },
  { label: '문서', href: '/documents', icon: SECTION_ICON.documents, sections: ['documents'] },
  {
    label: '엔지니어링',
    href: '/engineering',
    icon: SECTION_ICON.engineering,
    sections: ['engineering'],
  },
];

type TopBarProps = {
  repository: RepositoryRef;
  activeSection?: SectionId;
  activeView?: 'architecture' | 'source';
};

export function TopBar({ repository, activeSection, activeView }: TopBarProps) {
  const isActive = (view: (typeof VIEWS)[number]) =>
    activeView
      ? view.href === `/${activeView}`
      : activeSection
        ? view.sections.includes(activeSection)
        : view.sections.length === 0;

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-2 border-b border-stroke-light bg-background-surface px-4 py-2 max-lg:sticky max-lg:top-0 max-lg:z-20 lg:flex-nowrap lg:gap-x-4">
      <div className="flex min-w-0 items-center gap-2">
        <ExplorerToggle />
        <p className="flex min-w-0 items-center gap-2 typo-body-medium-strong">
          <Icon name="brand" className="text-text-link" />
          <span className="truncate">{PRODUCT_NAME}</span>
        </p>
      </div>

      {/* From `xl` only: the overview page carries the same line. */}
      <p className="hidden min-w-0 shrink-[4] truncate text-text-light xl:block">
        <span className="devhub-code">
          {repository.owner}/{repository.name}
        </span>{' '}
        <SnapshotSummary />
      </p>

      <GlobalSearch />

      {/* From `lg` only: below it the explorer drawer lists the same views. */}
      <nav aria-label="보기" className="ml-auto hidden shrink-0 lg:block">
        <ul className="flex items-center gap-1">
          {VIEWS.map((view) => (
            <li key={view.href}>
              <Link
                href={view.href}
                aria-current={isActive(view) ? 'page' : undefined}
                className="flex min-h-9 items-center gap-1.5 rounded-md px-3 whitespace-nowrap typo-body-small text-text-light hover:bg-background-default aria-[current=page]:bg-(--ds-background-selected) aria-[current=page]:text-text-default aria-[current=page]:typo-body-small-strong"
              >
                <Icon name={view.icon} />
                {view.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <ThemeSwitch />
    </header>
  );
}
