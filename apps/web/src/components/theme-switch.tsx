'use client';

import { useSyncExternalStore } from 'react';

import { Switch } from '@berrypjh/react-ui';

import { chooseTheme, currentTheme, subscribeTheme } from '@/lib/theme';

const isDark = () => currentTheme() === 'dark';

const isDarkOnServer = () => false;

export function ThemeSwitch() {
  const checked = useSyncExternalStore(subscribeTheme, isDark, isDarkOnServer);

  return (
    <Switch
      checked={checked}
      onChange={(event) => chooseTheme(event.target.checked ? 'dark' : 'light')}
    >
      다크 모드
    </Switch>
  );
}
