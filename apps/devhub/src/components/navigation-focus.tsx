'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Where keyboard focus lands after a navigation that removed the focused element (a move to
 * another layout redraws the whole shell). Focusing this spot, just before the skip links, makes
 * the next Tab "본문으로 건너뛰기" again, as on a page load. A move that keeps focus on its element
 * (selecting a node on the canvas) is left alone.
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
