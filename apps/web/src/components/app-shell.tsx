import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { ThemeSwitch } from '@/components/theme-switch';

const PRODUCT_NAME = '이미지 액션 라우터';
const MAIN_CONTENT_ID = 'main-content';

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/history', label: '기록' },
] as const;

type AppShellProps = {
  inApp: boolean;
  children: ReactNode;
};

export function AppShell({ inApp, children }: AppShellProps) {
  if (inApp) {
    return (
      <main id={MAIN_CONTENT_ID} className="min-h-dvh px-4 py-6">
        <div className="mx-auto w-full max-w-(--container-3xl)">{children}</div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <SkipLink targetId={MAIN_CONTENT_ID}>본문으로 건너뛰기</SkipLink>

      <aside className="hidden w-60 shrink-0 border-r border-stroke-light bg-background-default md:block">
        <div className="flex h-14 items-center px-5 typo-body-medium-strong">{PRODUCT_NAME}</div>
        <nav aria-label="주요 메뉴" className="px-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center rounded-md px-2 typo-paragraph-default text-text-default hover:bg-background-surface"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-stroke-light px-4 md:px-6">
          <span className="typo-body-medium-strong md:hidden">{PRODUCT_NAME}</span>
          <div className="ml-auto">
            <ThemeSwitch />
          </div>
        </header>

        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 px-4 py-8 md:px-6">
          <div className="mx-auto w-full max-w-(--container-3xl)">{children}</div>
        </main>
      </div>
    </div>
  );
}
