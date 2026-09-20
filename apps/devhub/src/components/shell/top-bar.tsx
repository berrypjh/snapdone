import Link from 'next/link';

import type { RepositoryRef } from '@/domain/model';
import type { SectionId } from '@/lib/catalog/entities';

import { SnapshotSummary } from '../overview/snapshot-summary';
import { Icon, type IconName } from '../ui/icon';
import { SECTION_ICON, VIEW_ICON } from '../ui/view-icons';

import { ExplorerToggle } from './explorer-drawer';
import { GlobalSearch } from './global-search';
import { ThemeSwitch } from './theme-switch';

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
  { label: '기록', href: '/records', icon: SECTION_ICON.records, sections: ['records'] },
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

      {/* `xl`부터만 보인다. 같은 줄이 개요 페이지에도 있다. */}
      <p className="hidden min-w-0 shrink-[4] truncate text-text-light xl:block">
        <span className="devhub-code">
          {repository.owner}/{repository.name}
        </span>{' '}
        <SnapshotSummary />
      </p>

      <GlobalSearch />

      {/* `lg`부터만 보인다. 그 아래에서는 탐색기 서랍이 같은 보기를 담는다. */}
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
