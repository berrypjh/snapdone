'use client';

import { useSyncExternalStore } from 'react';

import {
  applyTheme,
  currentTheme,
  Icon,
  subscribeTheme,
  type ThemeMode,
} from '@berrypjh/devhub-ui';
import { SegmentControl } from '@berrypjh/react-ui';

/** 아이콘만 있는 선택지. 해와 달이 선택을 보이고, 버튼 이름은 `ariaLabel`이 맡는다. */
const OPTIONS = [
  { value: 'light', label: <Icon name="sun" />, ariaLabel: '라이트' },
  { value: 'dark', label: <Icon name="moon" />, ariaLabel: '다크' },
] as const;

/**
 * 라이트 · 다크 선택. 동작은 공용 theme helper다. 공용 `ThemeSwitch`(1.2.0)는 서버 snapshot이 없어
 * Next SSR에서 던지므로, 고쳐진 릴리스가 나올 때까지 이 얇은 wrapper가 서버 값(`light`)만 더한다.
 */
export function ThemeSwitch() {
  const mode = useSyncExternalStore(
    subscribeTheme,
    () => currentTheme(),
    (): ThemeMode => 'light',
  );

  return (
    <SegmentControl
      aria-label="화면 테마"
      value={mode}
      onChange={(next: ThemeMode) => applyTheme(next)}
      options={OPTIONS}
      className="w-auto shrink-0"
    />
  );
}
