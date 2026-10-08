import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';
import type { ReactNode } from 'react';

import { LogoutButton } from '@/components/auth/logout-button';
import { ThemeSwitch } from '@/components/theme-switch';

const PRODUCT_NAME = '이미지 액션 라우터';
const MAIN_CONTENT_ID = 'main-content';

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/history', label: '기록' },
] as const;

type AppShellProps = {
  inApp: boolean;
  signedIn: boolean;
  children: ReactNode;
};

export function AppShell({ inApp, signedIn, children }: AppShellProps) {
  if (inApp) {
    return (
      <main id={MAIN_CONTENT_ID} className="min-h-dvh px-4 py-6">
        <div className="mx-auto w-full max-w-(--container-3xl)">{children}</div>
      </main>
    );
  }

  // 셸 전체 폭을 제한한다. 넓은 화면에서는 양옆이 바깥 배경(background.default)으로 보이고,
  // 창이 좁아지면 그 여백이 먼저 사라진 뒤 셸이 줄어든다. 사이드바가 바깥과 같은 색이라 여백이 보일 때만 양옆에 선을 둔다.
  return (
    <div className="min-h-dvh bg-background-default">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col bg-background-surface md:flex-row min-[1440px]:border-x min-[1440px]:border-stroke-light">
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
            <div className="ml-auto flex items-center gap-4">
              <ThemeSwitch />
              {signedIn && <LogoutButton />}
            </div>
          </header>

          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 px-4 py-8 md:px-6">
            <div className="mx-auto w-full max-w-(--container-3xl)">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
