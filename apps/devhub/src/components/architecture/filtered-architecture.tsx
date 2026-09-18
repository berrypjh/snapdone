'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { ArchitectureModel } from '@/lib/architecture-layout';
import { ARCHITECTURE_FILTERS, filterHref, parseArchitectureFilters } from '@/lib/filters';

import { FilterBar } from '../filter-bar';

import { ArchitectureViews } from './architecture-views';

/**
 * Architecture filters from the URL query. Rendered inside a Suspense boundary whose fallback is
 * the unfiltered views, so the page stays static.
 */
export function FilteredArchitecture({ model }: { model: ArchitectureModel }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = parseArchitectureFilters(Object.fromEntries(params.entries()));
  const query = filterHref('', active, 'kind', active.kind).replace(/^\?/, '');

  return (
    <>
      <FilterBar basePath={pathname} groups={ARCHITECTURE_FILTERS} active={active} />
      <ArchitectureViews model={model} kind={active.kind} query={query} />
    </>
  );
}
