'use client';

import { useSyncExternalStore } from 'react';

import { SegmentControl } from '@berrypjh/react-ui';

import { THEME_KEY, type ThemeMode } from '@/lib/theme';

import { Icon } from './icon';

/** Icon-only options: the sun and moon show the choice, `ariaLabel` names each button. */
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

/** Light / dark choice. Reads and writes `<html data-theme>`; the choice is kept per browser. */
export function ThemeSwitch() {
  const mode = useSyncExternalStore(subscribe, current, (): ThemeMode => 'light');

  const choose = (next: ThemeMode) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts until reload.
    }
  };

  return (
    <SegmentControl
      aria-label="화면 테마"
      value={mode}
      onChange={choose}
      options={OPTIONS}
      className="w-auto"
    />
  );
}
