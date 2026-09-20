'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { markAnchor } from '@/lib/anchor-flash';

/**
 * 링크가 도착한 제목을 표시한다. 들어올 때와 이후 fragment가 바뀔 때마다 다시 표시한다.
 * 직접 그리지 않고, 붙인 속성을 스타일시트가 애니메이션한다.
 */
export function AnchorFlash() {
  const pathname = usePathname();

  useEffect(() => {
    const flash = () => markAnchor(document, window.location.hash);
    flash();
    window.addEventListener('hashchange', flash);
    return () => window.removeEventListener('hashchange', flash);
  }, [pathname]);

  return null;
}
