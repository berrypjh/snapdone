import type { ReactNode } from 'react';

import { Icon, type IconName } from './icon';

/** 목록 항목 하나. 왼쪽에 아이콘과 이름, 오른쪽에 내용을 둔다. */
export function Term({
  icon,
  term,
  count,
  children,
}: {
  icon: IconName;
  term: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="flex items-start gap-1.5 pt-0.5 typo-caption-small text-text-light">
        <Icon name={icon} />
        {term}
      </dt>
      <dd className="flex min-w-0 flex-col gap-1 typo-body-small">
        {count && <span className="typo-caption-small text-text-light">{count}</span>}
        {children}
      </dd>
    </div>
  );
}
