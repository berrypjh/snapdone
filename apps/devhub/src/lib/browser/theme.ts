/**
 * 밝게 · 어둡게 둘뿐이다. 라이브러리 토큰이 `data-theme`로 바뀌고(`:root`가 밝게,
 * `[data-theme="dark"]`가 어둡게), DevHub는 그 속성을 `<html>`에 붙여서 페이지 배경과
 * 스크롤바까지 따라오게 한다.
 */
export type ThemeMode = 'light' | 'dark';

export const THEME_KEY = 'devhub-theme';

/**
 * `<head>`에 넣는 인라인 스크립트. 저장된 선택을, 없으면 OS 설정을 첫 그리기 전에 적용해서
 * 페이지가 반대 테마로 깜빡이지 않게 한다. 저장소를 못 쓸 수도 있다.
 */
export const themeScript = `(function () {
  var mode;
  try { mode = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
  if (mode !== 'light' && mode !== 'dark') {
    mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = mode;
})();`;
