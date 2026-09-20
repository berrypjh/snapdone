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
 * `lg` 아래에서 쓰는 탐색기 서랍의 열림 상태. 상단 바 버튼과 서랍이 함께 쓴다. 화면을 옮기면
 * 항목을 고른 것이므로 닫는다.
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

/** `lg` 아래에서 탐색기를 여닫는 상단 바 메뉴 버튼. */
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
 * 탐색기 창. `lg`부터는 왼쪽 칸이고, 그 아래에서는 어두워진 화면 위로 왼쪽에서 밀려 나온다.
 * modal이 아니라 disclosure다. Escape · 닫기 버튼 · 배경 · 포커스가 밖으로 나가면 닫히므로
 * 포커스가 갇히지 않는다.
 */
export function ExplorerPane({ children }: { children: ReactNode }) {
  const { open, close } = useDrawer();
  const paneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = paneRef.current?.querySelector(`#${ITEMS_ID}`);
    (
      items?.querySelector<HTMLElement>('[aria-current="page"]') ?? items?.querySelector('a')
    )?.focus();
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
          'max-lg:duration-200 max-lg:motion-reduce:transition-none',
          // 열 때는 바로 보여야 항목이 포커스를 받고, 닫을 때는 미끄러진 뒤에 감춘다.
          open
            ? 'max-lg:transition-[translate]'
            : 'max-lg:invisible max-lg:-translate-x-full max-lg:transition-[translate,visibility]',
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
