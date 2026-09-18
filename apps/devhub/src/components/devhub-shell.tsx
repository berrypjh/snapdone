import type { ReactNode } from 'react';

import { catalog } from '@/data';
import type { SectionId } from '@/lib/entities';

import { Explorer } from './explorer';
import { ExplorerDrawerProvider } from './explorer-drawer';
import { TopBar } from './top-bar';

type DevHubShellProps = {
  selection: { section?: SectionId; id?: string; view?: 'architecture' | 'source' };
  /** The `<main>` workspace. */
  children: ReactNode;
  /** The right `<aside>`. A route page supplies it so the selection can change under a layout. */
  inspector: ReactNode;
};

/**
 * Three-pane developer shell: top bar, explorer, workspace, inspector.
 * From `lg` each pane scrolls on its own so explorer and inspector stay in view; below that the
 * workspace and inspector stack in reading order and the explorer becomes a drawer opened from
 * the top bar, so it never pushes the workspace off screen. The side panes are narrower at `lg` and widen at `xl`: at their full width a
 * 1024px screen would leave the workspace narrower than a phone.
 *
 * On very wide screens the whole shell stops at 115rem and is centered, with a hairline at its
 * edges — like the reference docs app (1440px there, with one side pane; DevHub has two, so the
 * cap leaves the workspace about the width that app gives its content). As there, the shell is
 * `background-surface` and the margin around it the page's `background-default`, a shade apart.
 *
 * Each pane is `relative`: screen-reader-only text is `position: absolute`, and without a
 * positioned pane it would be placed against the page instead, lengthen the document past the
 * viewport, and let the page itself scroll once a pane reaches its end.
 *
 * Skip links live in the root layout, not here: after a navigation that swaps this shell, Next
 * focuses the first element of the new content, which would otherwise be a skip link — and a
 * focused skip link shows itself even after a mouse click.
 */
export function DevHubShell({ selection, children, inspector }: DevHubShellProps) {
  return (
    <ExplorerDrawerProvider>
      <div className="mx-auto grid min-h-dvh w-full max-w-[115rem] grid-rows-[auto_1fr] border-stroke-light bg-background-surface min-[115rem]:border-x lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)]">
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
