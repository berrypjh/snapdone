/**
 * Light and dark only. The library's tokens switch on `data-theme` (`:root` is light,
 * `[data-theme="dark"]` is dark); the DevHub sets that attribute on `<html>` so the page
 * background and scrollbars follow too.
 */
export type ThemeMode = 'light' | 'dark';

export const THEME_KEY = 'devhub-theme';

/**
 * Inline script for `<head>`: applies the stored choice, else the OS preference, before the
 * first paint so the page never flashes the other theme. Storage may be unavailable.
 */
export const themeScript = `(function () {
  var mode;
  try { mode = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
  if (mode !== 'light' && mode !== 'dark') {
    mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = mode;
})();`;
