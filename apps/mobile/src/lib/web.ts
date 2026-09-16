export const getWebBaseUrl = (): string => {
  const value = process.env.EXPO_PUBLIC_WEB_BASE_URL;

  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_WEB_BASE_URL이 설정되지 않았습니다. apps/mobile/.env.example을 apps/mobile/.env로 복사하고 Metro를 --clear로 재시작하세요.',
    );
  }

  return value.replace(/\/+$/, '');
};

export const webUrl = (path: string) =>
  `${getWebBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

export const webViewNavigation = (url: string): 'load' | 'external' => {
  const base = getWebBaseUrl();
  const isWebApp = url === base || ['/', '?', '#'].some((next) => url.startsWith(base + next));

  return isWebApp || url.startsWith('about:') ? 'load' : 'external';
};
