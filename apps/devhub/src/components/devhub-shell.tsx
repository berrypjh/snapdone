import type { ReactNode } from 'react';

import { catalog } from '@/data';
import type { SectionId } from '@/lib/entities';

import { Explorer } from './explorer';
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
 * panes stack in reading order and the explorer folds behind a button so the workspace is not
 * pushed off screen.
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
    <div className="grid min-h-dvh grid-rows-[auto_1fr] lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)]">
      <TopBar
        repository={catalog.repository}
        activeSection={selection.section}
        activeView={selection.view}
      />
      <div className="grid lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <Explorer selection={selection} />
        {children}
        {inspector}
      </div>
    </div>
  );
}
