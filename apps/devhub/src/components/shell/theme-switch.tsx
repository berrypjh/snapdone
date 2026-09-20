'use client';

import { useSyncExternalStore } from 'react';

import { SegmentControl } from '@berrypjh/react-ui';

import { THEME_KEY, type ThemeMode } from '@/lib/browser/theme';

import { Icon } from '../ui/icon';

/** 아이콘만 있는 선택지. 해와 달이 선택을 보이고, 버튼 이름은 `ariaLabel`이 맡는다. */
const OPTIONS = [
  { value: 'light', label: <Icon name="sun" />, ariaLabel: '라이트' },
  { value: 'dark', label: <Icon name="moon" />, ariaLabel: '다크' },
] as const;

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};

const current = (): ThemeMode =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** 라이트 · 다크 선택. `<html data-theme>`를 읽고 쓰며, 선택은 브라우저마다 남는다. */
export function ThemeSwitch() {
  const mode = useSyncExternalStore(subscribe, current, (): ThemeMode => 'light');

  const choose = (next: ThemeMode) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장이 막힐 수 있다. 그때는 선택이 새로고침 전까지만 남는다.
    }
  };

  return (
    <SegmentControl
      aria-label="화면 테마"
      value={mode}
      onChange={choose}
      options={OPTIONS}
      className="w-auto shrink-0"
    />
  );
}
