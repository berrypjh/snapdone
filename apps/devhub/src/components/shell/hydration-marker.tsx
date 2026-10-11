'use client';

import { useEffect } from 'react';

/** hydration이 끝나면 `<html data-hydrated>`를 붙인다. E2E가 입력 전에 이 표시를 기다린다. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset['hydrated'] = 'true';
  }, []);
  return null;
}
