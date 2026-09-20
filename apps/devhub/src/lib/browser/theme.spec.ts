import { runInNewContext } from 'node:vm';

import { createElement } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ThemeSwitch } from '../../components/shell/theme-switch';

import { THEME_KEY, themeScript } from './theme';

/** head 스크립트를 가짜 브라우저에서 돌리고 설정된 `data-theme`를 돌려준다. */
const run = ({
  stored,
  osDark,
  storageThrows = false,
}: {
  stored?: string;
  osDark: boolean;
  storageThrows?: boolean;
}) => {
  const documentElement = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('blocked');
      return key === THEME_KEY ? (stored ?? null) : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: osDark && query === '(prefers-color-scheme: dark)',
  });
  runInNewContext(themeScript, { localStorage, matchMedia, document: { documentElement } });
  return documentElement.dataset.theme;
};

describe('theme script', () => {
  it('uses the stored choice over the OS preference', () => {
    expect(run({ stored: 'dark', osDark: false })).toBe('dark');
    expect(run({ stored: 'light', osDark: true })).toBe('light');
  });

  it('follows the OS preference without a valid stored choice', () => {
    expect(run({ osDark: true })).toBe('dark');
    expect(run({ osDark: false })).toBe('light');
    expect(run({ stored: 'sepia', osDark: true })).toBe('dark');
  });

  it('still applies the OS preference when storage is blocked', () => {
    expect(run({ osDark: true, storageThrows: true })).toBe('dark');
  });
});

describe('ThemeSwitch', () => {
  it('is a named group of two icon buttons, each named and pressed-state', () => {
    const html = renderToStaticMarkup(createElement(ThemeSwitch));
    expect(html).toContain('aria-label="화면 테마"');
    const buttons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(
      ([, attributes, inner]) => ({
        name: attributes.match(/aria-label="([^"]+)"/)?.[1],
        pressed: attributes.match(/aria-pressed="(\w+)"/)?.[1],
        text: inner.replace(/<[^>]+>/g, ''),
        icon: inner.includes('<svg aria-hidden="true"'),
      }),
    );
    expect(buttons).toEqual([
      { name: '라이트', pressed: 'true', text: '', icon: true },
      { name: '다크', pressed: 'false', text: '', icon: true },
    ]);
  });
});
