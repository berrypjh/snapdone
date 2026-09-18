import type { ReactNode } from 'react';

import { Icon, type IconName } from './icon';

/** App ids carry a prefix: document headings are free text and could take a bare name. */
export const MAIN_CONTENT_ID = 'devhub-main';
export const INSPECTOR_ID = 'devhub-inspector';

/**
 * A link that opens another item's details. It carries the inspector's id as its hash, so after
 * the move Next scrolls to and focuses the new details: on a narrow screen, where the inspector
 * sits below the workspace, the reader stays in the details instead of going back to the top.
 */
export const detailsHref = (href: string) => `${href}#${INSPECTOR_ID}`;

type HeaderProps = {
  eyebrow: string;
  /** The view's icon, shown with the eyebrow: the same shape as in the top bar and explorer. */
  icon?: IconName;
  title: string;
  /** Extra classes, e.g. the centered column a document page shares with its text. */
  className?: string;
};

/** Center pane frame. Its first child should be a `WorkspaceHeader`. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="relative min-w-0 lg:overflow-y-auto">
      <div className="flex flex-col gap-5 px-4 pt-4 pb-12 sm:px-8 sm:pt-6 sm:pb-16">{children}</div>
    </main>
  );
}

/** Where the selected thing is named. */
export function WorkspaceHeader({ eyebrow, icon, title, className }: HeaderProps) {
  return (
    <header className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
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
  );
}

/** Center pane: where the selected thing is named and summarised. */
export function Workspace({ children, ...header }: HeaderProps & { children: ReactNode }) {
  return (
    <WorkspaceFrame>
      <WorkspaceHeader {...header} />
      {children}
    </WorkspaceFrame>
  );
}

/**
 * Reserved area for the relation diagram. Nothing is drawn yet; the list next to it is the
 * canonical representation (devhub.md 21).
 */
export function DiagramPlaceholder({ listId }: { listId: string }) {
  return (
    <figure className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stroke-default bg-background-default devhub-grid">
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
