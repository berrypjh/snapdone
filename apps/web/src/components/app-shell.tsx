import type { ReactNode } from 'react';

const PRODUCT_NAME = '이미지 액션 라우터';

/**
 * Page frame for every web screen.
 *
 * The sidebar is desktop-only and currently holds the wordmark alone —
 * navigation items go in once there are real routes to link to. On narrow
 * viewports the sidebar is gone and the header carries the wordmark instead.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-muted md:block">
        <div className="flex h-14 items-center px-5 text-card-title font-semibold">
          {PRODUCT_NAME}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-border px-4 md:px-6">
          <span className="text-card-title font-semibold md:hidden">
            {PRODUCT_NAME}
          </span>
        </header>

        <main className="flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
