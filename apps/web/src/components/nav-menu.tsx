'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChevronLeft, CircleUserRound, History, House } from 'lucide-react';

import { PAGE_TITLE as ME_TITLE, PATH as ME_PATH } from './me/me-copy';

/** 주 메뉴. 넓은 화면은 사이드바, 폰 폭은 하단 탭이 같은 항목을 쓴다. 앱도 같은 구성의 네이티브 탭이다. */
const HOME = { href: '/', label: '홈', Icon: House, current: (path: string) => path === '/' };
const HISTORY = {
  href: '/history',
  label: '기록',
  Icon: History,
  current: (path: string) => path.startsWith('/history'),
};
/** 처리 설정은 내 정보에서 들어가므로 내 정보 탭에 속한다. */
const ME = {
  href: ME_PATH,
  label: ME_TITLE,
  Icon: CircleUserRound,
  current: (path: string) => path.startsWith(ME_PATH) || path.startsWith('/settings'),
};

/** 넓은 화면의 사이드바 메뉴. 내 정보는 헤더 오른쪽에 있다. */
export function SidebarMenu() {
  const path = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="px-3">
      <ul className="flex flex-col gap-1">
        {[HOME, HISTORY].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current(path) ? 'page' : undefined}
              className="flex min-h-11 items-center gap-2 rounded-md px-2 typo-paragraph-default text-text-default hover:bg-background-surface aria-[current=page]:bg-background-surface aria-[current=page]:typo-body-medium-strong"
            >
              <item.Icon aria-hidden size={20} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 폰 폭의 하단 탭. 화면 아래에 붙고, 지금 화면은 색과 `aria-current`로 알린다.
 * 넓은 화면(md 이상)에서는 사이드바가 대신하고, 앱 WebView 안에서는 셸이 그리지 않는다.
 */
export function BottomTabs() {
  const path = usePathname();
  return (
    <nav
      aria-label="하단 메뉴"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-stroke-light bg-background-surface md:hidden"
    >
      <ul className="mx-auto flex max-w-(--container-3xl)">
        {[HOME, HISTORY, ME].map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={item.current(path) ? 'page' : undefined}
              className="flex min-h-14 flex-col items-center justify-center gap-1 typo-caption-default text-text-light aria-[current=page]:text-text-primary"
            >
              <item.Icon aria-hidden size={22} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 하위 화면. 헤더 왼쪽이 "‹ 화면 제목"이고, 뒤로 가기는 브라우저 기록이 아니라 늘 정한 상위 화면으로 간다. */
const SUB_PAGES = [
  { match: /^\/history\/[^/]+$/, title: '처리 결과', back: HISTORY, backName: '기록으로 돌아가기' },
  { match: /^\/process$/, title: '사진 처리', back: HOME, backName: '홈으로 돌아가기' },
  {
    match: /^\/settings\/processing$/,
    title: '사진 종류별 기본 처리',
    back: ME,
    backName: '내 정보로 돌아가기',
  },
];

/**
 * 헤더 왼쪽. 하위 화면(처리 결과 · 사진 처리 · 처리 설정)이면 모든 폭에서 뒤로 가기와 화면 제목이다 — 앱의 화면 헤더와 같다.
 * 탭 화면이면 폰 폭에서만 제품명을 보인다. 넓은 화면은 사이드바 위에 제품명이 있다.
 * 헤더가 고정이라 스크롤해도 뒤로 가기가 남는다.
 */
export function HeaderTitle({ productName }: { productName: string }) {
  const path = usePathname();
  const sub = SUB_PAGES.find((page) => page.match.test(path));
  if (!sub) return <span className="typo-body-medium-strong md:hidden">{productName}</span>;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        href={sub.back.href}
        aria-label={sub.backName}
        className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center text-text-default"
      >
        <ChevronLeft aria-hidden size={24} />
      </Link>
      <span className="truncate typo-body-medium-strong">{sub.title}</span>
    </div>
  );
}
