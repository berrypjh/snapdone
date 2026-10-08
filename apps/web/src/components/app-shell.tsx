import Link from 'next/link';

import { SkipLink } from '@berrypjh/react-ui';
import { CircleUserRound } from 'lucide-react';
import type { ReactNode } from 'react';

import { PAGE_TITLE as ME_TITLE, PATH as ME_PATH } from '@/components/me/me-copy';
import { BottomTabs, HeaderTitle, SidebarMenu } from '@/components/nav-menu';
import { ThemeSwitch } from '@/components/theme-switch';

const PRODUCT_NAME = '이미지 액션 라우터';
const MAIN_CONTENT_ID = 'main-content';

// 본문 틀의 pb-5xl(64px 토큰)은 main의 아래 여백(py-8 · py-6)에 더해져, 마지막 내용이 화면 끝에 붙지 않게 한다.
// 폰 폭의 하단 탭(56px)도 이 여백 안에 들어가 마지막 내용을 가리지 않는다.
// 헤더(h-14)와 넓은 화면의 사이드바는 화면에 고정된다 — 앱의 탭 · 화면 헤더와 같다. 본문만 스크롤된다.

/** 아이콘은 장식이다. 뜻은 옆의 글자가 전한다. */
const ICON_SIZE = 20;

type AppShellProps = {
  inApp: boolean;
  signedIn: boolean;
  children: ReactNode;
};

export function AppShell({ inApp, signedIn, children }: AppShellProps) {
  if (inApp) {
    return (
      <main id={MAIN_CONTENT_ID} className="min-h-dvh px-4 py-6">
        <div className="mx-auto w-full max-w-(--container-3xl) pb-5xl">{children}</div>
      </main>
    );
  }

  // 셸 전체 폭을 제한한다. 넓은 화면에서는 양옆이 바깥 배경(background.default)으로 보이고,
  // 창이 좁아지면 그 여백이 먼저 사라진 뒤 셸이 줄어든다. 사이드바가 바깥과 같은 색이라 여백이 보일 때만 양옆에 선을 둔다.
  return (
    <div className="min-h-dvh bg-background-default">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col bg-background-surface md:flex-row min-[1440px]:border-x min-[1440px]:border-stroke-light">
        <SkipLink targetId={MAIN_CONTENT_ID}>본문으로 건너뛰기</SkipLink>

        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-stroke-light bg-background-default md:sticky md:top-0 md:block md:h-dvh md:self-start">
          <div className="flex h-14 items-center px-5 typo-body-medium-strong">{PRODUCT_NAME}</div>
          <SidebarMenu />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-stroke-light bg-background-surface px-4 md:px-6">
            <HeaderTitle productName={PRODUCT_NAME} />
            {/* 설정 · 테마 · 로그아웃은 내 정보에 모은다. 로그인 전에는 테마만 바로 고른다. */}
            <div className="ml-auto flex items-center gap-4">
              {signedIn ? (
                // 폰 폭에서는 하단 탭의 내 정보가 대신한다.
                <Link
                  href={ME_PATH}
                  className="hidden min-h-11 items-center gap-2 typo-body-medium-strong md:inline-flex text-text-default underline-offset-4 hover:underline"
                >
                  <CircleUserRound aria-hidden size={ICON_SIZE} />
                  {ME_TITLE}
                </Link>
              ) : (
                <ThemeSwitch />
              )}
            </div>
          </header>

          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 px-4 py-8 md:px-6">
            <div className="mx-auto w-full max-w-(--container-3xl) pb-5xl">{children}</div>
          </main>
        </div>
      </div>
      {signedIn && <BottomTabs />}
    </div>
  );
}
