'use client';

import {
  createContext,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

import { IconButton } from '@berrypjh/react-ui';

import { Icon } from './icon';

const ITEMS_ID = 'explorer-items';
const TOGGLE_ID = 'explorer-toggle';

type Drawer = { open: boolean; toggle: () => void; close: (returnFocus: boolean) => void };

const DrawerContext = createContext<Drawer | null>(null);

const useDrawer = () => {
  const drawer = useContext(DrawerContext);
  if (!drawer) throw new Error('ExplorerDrawerProvider is missing');
  return drawer;
};

/**
 * Open state of the explorer drawer below `lg`, shared by the top bar button and the pane. A
 * navigation closes it: the item was chosen.
 */
export function ExplorerDrawerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) document.getElementById(TOGGLE_ID)?.focus();
  }, []);

  return (
    <DrawerContext.Provider value={{ open, toggle, close }}>{children}</DrawerContext.Provider>
  );
}

/** Top bar menu button that opens and closes the explorer below `lg`. */
export function ExplorerToggle() {
  const { open, toggle } = useDrawer();
  return (
    <IconButton
      id={TOGGLE_ID}
      size="sm"
      color="secondary"
      aria-label="탐색기"
      aria-expanded={open}
      aria-controls={ITEMS_ID}
      onClick={toggle}
      className="lg:hidden"
    >
      <Icon name="menu" />
    </IconButton>
  );
}

/**
 * The explorer pane. From `lg` it is the left column; below that it slides in from the left over
 * a dimmed page. It is a disclosure, not a modal: Escape, the close button, the backdrop, or
 * moving focus out of it closes it, so focus is never trapped.
 */
export function ExplorerPane({ children }: { children: ReactNode }) {
  const { open, close } = useDrawer();
  const paneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const pane = paneRef.current;
    pane?.querySelector<HTMLElement>(`#${ITEMS_ID} [aria-current="page"], #${ITEMS_ID} a`)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) close(false);
  };

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          onClick={() => close(true)}
          className="fixed inset-0 z-30 bg-neutral-ne900/50 lg:hidden"
        />
      )}
      <aside
        ref={paneRef}
        aria-label="탐색기"
        onBlur={onBlur}
        className={[
          'relative bg-background-surface lg:overflow-y-auto lg:border-r lg:border-stroke-light',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[min(20rem,85vw)] max-lg:overflow-y-auto max-lg:shadow-4',
          'max-lg:transition-[translate,visibility] max-lg:duration-200 motion-reduce:transition-none',
          open ? '' : 'max-lg:invisible max-lg:-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-stroke-light p-3 lg:hidden">
          <p className="typo-body-small-strong">탐색기</p>
          <IconButton
            size="sm"
            color="secondary"
            aria-label="탐색기 닫기"
            onClick={() => close(true)}
          >
            <Icon name="close" />
          </IconButton>
        </div>
        <div id={ITEMS_ID}>{children}</div>
      </aside>
    </>
  );
}
