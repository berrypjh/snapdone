'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 포커스를 가진 요소가 사라지는 이동(다른 레이아웃으로 가면 셸 전체를 다시 그린다) 뒤에 키보드
 * 포커스가 놓이는 자리. 건너뛰기 링크 바로 앞이라 다음 Tab이 다시 "본문으로 건너뛰기"가 된다.
 * 포커스가 그대로 남는 이동(캔버스에서 구성 요소 선택)은 건드리지 않는다.
 */
export function NavigationFocus() {
  const pathname = usePathname();
  const spot = useRef<HTMLDivElement>(null);
  const shown = useRef(pathname);

  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (document.activeElement === document.body) spot.current?.focus();
  }, [pathname]);

  return <div ref={spot} tabIndex={-1} className="outline-none" />;
}
