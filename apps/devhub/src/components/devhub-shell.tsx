import type { ReactNode } from 'react';

import { catalog } from '@/data';
import type { SectionId } from '@/lib/entities';

import { Explorer } from './explorer';
import { ExplorerDrawerProvider } from './explorer-drawer';
import { TopBar } from './top-bar';

type DevHubShellProps = {
  selection: { section?: SectionId; id?: string; view?: 'architecture' | 'source' };
  /** `<main>` 작업 영역. */
  children: ReactNode;
  /** 오른쪽 `<aside>`. 레이아웃 아래에서 선택이 바뀔 수 있도록 route page가 넘긴다. */
  inspector: ReactNode;
};

export function DevHubShell({ selection, children, inspector }: DevHubShellProps) {
  return (
    <ExplorerDrawerProvider>
      <div className="mx-auto grid min-h-dvh w-full max-w-[115rem] grid-cols-1 grid-rows-[auto_1fr] border-stroke-light bg-background-surface min-[115rem]:border-x lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)]">
        <TopBar
          repository={catalog.repository}
          activeSection={selection.section}
          activeView={selection.view}
        />
        <div className="grid lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_20rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
          <Explorer selection={selection} />
          {children}
          {inspector}
        </div>
      </div>
    </ExplorerDrawerProvider>
  );
}
