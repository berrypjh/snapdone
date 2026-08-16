/**
 * Design tokens for the mobile app.
 *
 * These values mirror the `@theme` block in apps/web/src/app/global.css.
 * docs/design/foundation.md is the source of truth for both — change it there
 * first, then update both platforms.
 */

import type { TextStyle } from 'react-native';

export const color = {
  background: '#ffffff',
  surface: '#ffffff',
  surfaceMuted: '#f6f7f9',

  textPrimary: '#17191c',
  textSecondary: '#4a4f57',
  textMuted: '#868c96',

  border: '#e4e7ec',

  primary: '#1b64da',
  primaryHover: '#1857c0',
  primaryPressed: '#14489e',
  onPrimary: '#ffffff',

  success: '#0f7b4f',
  warning: '#b26b00',
  danger: '#c7362f',

  focus: '#1b64da',
} as const;

/** 4px scale. Web uses the same steps as Tailwind's 1/2/3/4/5/6/8. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

/**
 * Korean-first hierarchy. React Native needs absolute line heights, so these
 * are the web ratios resolved against each size.
 */
export const typography = {
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: '600' },
  sectionTitle: { fontSize: 18, lineHeight: 27, fontWeight: '600' },
  cardTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 26 },
  bodySmall: { fontSize: 14, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 21 },
  button: { fontSize: 15, lineHeight: 18, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

/** Smallest tappable height, matching the web button. */
export const minTouchTarget = 44;
