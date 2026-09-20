import Link from 'next/link';

import { type ActiveFilters, type FilterGroup, filterHref } from '@/lib/filters';

const OPTION =
  'inline-flex min-h-8 items-center rounded-md px-2 typo-caption-small text-text-link hover:bg-background-default aria-[current=true]:bg-(--ds-background-selected) aria-[current=true]:text-text-default aria-[current=true]:typo-body-small-strong';

function Option({ href, current, label }: { href: string; current: boolean; label: string }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={current ? 'true' : undefined}
        className={OPTION}
      >
        {current && <span aria-hidden="true">✓&nbsp;</span>}
        {label}
      </Link>
    </li>
  );
}

/**
 * 보기 필터를 그냥 링크로. JavaScript 없이도 되고 다른 필터를 유지하며, 선택된 항목은
 * `aria-current`와 체크 표시 · 굵기로 알린다. 색만으로 알리지 않는다.
 */
export function FilterBar({
  basePath,
  groups,
  active,
}: {
  basePath: string;
  groups: FilterGroup[];
  active: ActiveFilters;
}) {
  return (
    <nav aria-label="필터" className="flex flex-col gap-2">
      {groups.map((group) => (
        <div
          key={group.param}
          role="group"
          aria-labelledby={`filter-${group.param}`}
          className="flex flex-wrap items-center gap-2"
        >
          <span id={`filter-${group.param}`} className="w-14 typo-caption-small text-text-light">
            {group.label}
          </span>
          <ul className="flex flex-wrap gap-1">
            <Option
              href={filterHref(basePath, active, group.param, undefined)}
              current={!active[group.param]}
              label="전체"
            />
            {group.options.map((option) => (
              <Option
                key={option.value}
                href={filterHref(basePath, active, group.param, option.value)}
                current={active[group.param] === option.value}
                label={option.label}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
