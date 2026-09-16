export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'snapdone-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const themeInitScript = `(function(){var t=matchMedia('${DARK_QUERY}').matches?'dark':'light';try{var s=localStorage.getItem('${STORAGE_KEY}');if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})()`;

const root = () => document.documentElement;

export const currentTheme = (): ThemeMode =>
  root().dataset['theme'] === 'dark' ? 'dark' : 'light';

function readSavedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

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

  const media = matchMedia(DARK_QUERY);
  const followSystem = () => {
    if (readSavedTheme() === null) root().dataset['theme'] = media.matches ? 'dark' : 'light';
  };
  media.addEventListener('change', followSystem);

  return () => {
    observer.disconnect();
    media.removeEventListener('change', followSystem);
  };
}
