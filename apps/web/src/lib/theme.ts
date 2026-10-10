export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'snapdone-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * 첫 paint 전에 테마를 정하고, 저장된 선택이 없으면 이후 시스템 설정 변경도 따라간다.
 * 어느 화면에서든 따라가도록 스위치가 아니라 이 스크립트가 시스템 변경을 듣는다.
 */
export const themeInitScript = `(function(){var q=matchMedia('${DARK_QUERY}');function apply(){var t=q.matches?'dark':'light';try{var s=localStorage.getItem('${STORAGE_KEY}');if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t}apply();q.addEventListener('change',apply)})()`;

const root = () => document.documentElement;

export const currentTheme = (): ThemeMode =>
  root().dataset['theme'] === 'dark' ? 'dark' : 'light';

export function chooseTheme(theme: ThemeMode) {
  root().dataset['theme'] = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage is blocked: the choice still holds for this page.
  }
}

export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
