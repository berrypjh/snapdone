import type { ReactNode } from 'react';

import { Icon, type IconName } from './icon';

export const MAIN_CONTENT_ID = 'main-content';
export const INSPECTOR_ID = 'inspector';

/** Center pane frame: where the selected thing is named and summarised. */
export function Workspace({
  eyebrow,
  icon,
  title,
  children,
}: {
  eyebrow: string;
  /** The view's icon, shown with the eyebrow: the same shape as in the top bar and explorer. */
  icon?: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative min-w-0 lg:overflow-y-auto">
      <div className="flex flex-col gap-5 p-6">
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 typo-caption-small text-text-light">
            {icon && <Icon name={icon} />}
            {eyebrow}
          </p>
          <h1 className="typo-heading-h5">{title}</h1>
          {/* Below `lg` the inspector sits after the whole workspace. */}
          <a
            href={`#${INSPECTOR_ID}`}
            className="typo-caption-small text-text-link underline-offset-2 hover:underline lg:hidden"
          >
            상세 정보로 이동
          </a>
        </header>
        {children}
      </div>
    </main>
  );
}

/**
 * Reserved area for the relation diagram. Nothing is drawn yet; the list next to it is the
 * canonical representation (devhub.md 21).
 */
export function DiagramPlaceholder({ listId }: { listId: string }) {
  return (
    <figure className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stroke-default bg-background-surface devhub-grid">
      <p className="typo-body-small-strong">관계 그림 — 아직 그리지 않았습니다</p>
      <figcaption className="typo-caption-small text-text-light">
        같은 내용은{' '}
        <a href={`#${listId}`} className="text-text-link underline">
          아래 목록
        </a>
        이 정본입니다.
      </figcaption>
    </figure>
  );
}

/** A titled block inside the workspace. */
export function WorkspaceSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      id={id}
      className="flex flex-col gap-3 rounded-lg border border-stroke-light bg-background-surface p-4"
    >
      <h2 id={`${id}-heading`} className="typo-body-small-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}
