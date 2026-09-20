'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import type { ArchitectureModel } from '@/lib/architecture-layout';
import { ARCHITECTURE_FILTERS, filterHref, parseArchitectureFilters } from '@/lib/filters';

import { FilterBar } from '../filter-bar';

import { ArchitectureViews } from './architecture-views';

/**
 * URL 쿼리에서 읽는 아키텍처 필터. fallback이 필터 없는 보기인 Suspense 안에서 그리기 때문에
 * 페이지는 static으로 남는다.
 */
export function FilteredArchitecture({ model }: { model: ArchitectureModel }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = parseArchitectureFilters(Object.fromEntries(params.entries()));
  const query = filterHref('', active, 'kind', active.kind).replace(/^\?/, '');

  return (
    <ArchitectureViews
      model={model}
      kind={active.kind}
      query={query}
      filter={<FilterBar basePath={pathname} groups={ARCHITECTURE_FILTERS} active={active} />}
    />
  );
}
