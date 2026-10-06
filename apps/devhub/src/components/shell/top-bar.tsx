'use client';

import { ExplorerToggle, Icon, useDevHub } from '@berrypjh/devhub-ui';
import type { ReactNode } from 'react';

import { ThemeSwitch } from './theme-switch';

/**
 * 공용 `TopBar`와 같은 줄이다 — 제품명, 요약(`xl` 부터), 검색, 테마. 화면 사이 이동은 탐색기가 맡는다.
 * 공용 것은 안의 `ThemeSwitch`(1.2.0)가 Next SSR에서 던지므로, 고쳐진 릴리스가 나올 때까지 이 저장소의
 * `ThemeSwitch`를 끼운 사본을 둔다.
 */
export const TopBar = ({
  summary,
  search,
}: {
  /** 저장소 · 스냅샷 같은 한 줄. `xl` 부터만 보인다. */
  summary?: ReactNode;
  /** `GlobalSearch`. */
  search?: ReactNode;
}) => {
  const { productName } = useDevHub();
  // `min-w-0`: 공용 셸의 바깥 grid는 열 크기를 정하지 않아(`auto`), 이 줄의 최소 폭이 화면보다 넓으면
  // 페이지가 옆으로 밀린다. grid 항목의 최소 폭을 0으로 둬 화면 폭에 맞춘다.
  return (
    <header className="flex min-h-14 min-w-0 items-center gap-sm border-b max-lg:flex-wrap border-stroke-light bg-background-surface px-lg py-sm max-lg:sticky max-lg:top-0 max-lg:z-20 lg:gap-lg">
      <div className={`flex min-w-0 flex-1 items-center gap-sm ${summary ? 'xl:flex-none' : ''}`}>
        <ExplorerToggle />
        <p className="flex min-w-0 items-center gap-sm typo-body-medium-strong">
          <Icon name="brand" className="text-text-link" />
          <span className="truncate">{productName}</span>
        </p>
      </div>
      {summary && (
        <p className="hidden min-w-0 flex-1 truncate typo-caption-small text-text-light xl:block">
          {summary}
        </p>
      )}
      {search}
      <ThemeSwitch />
    </header>
  );
};
