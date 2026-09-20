import type { RuntimeRef } from '../domain/model';

export const runtimes: RuntimeRef[] = [
  {
    id: 'browser',
    name: '브라우저',
    summary: '사용자의 브라우저. web의 client component와 Google 동의 화면이 여기서 돈다',
    node: 'web',
  },
  {
    id: 'next-server',
    name: 'Next 서버',
    summary: 'Server Component · Server Action · Route Handler. Go API를 부르는 유일한 web 쪽 주체',
    node: 'web',
  },
  {
    id: 'mobile-app',
    name: '앱 (React Native)',
    summary: '기기에서 도는 네이티브 앱',
    node: 'mobile',
  },
  {
    id: 'system-auth-browser',
    name: '시스템 인증 브라우저',
    summary: '앱이 openAuthSessionAsync로 여는 OS 인증 세션. 제품 WebView가 아니다',
  },
  {
    id: 'mobile-webview',
    name: '앱 WebView 안의 web',
    summary: 'User-Agent에 SnapdoneApp 토큰이 붙은 채 앱 안에서 열린 web',
    node: 'web',
  },
  {
    id: 'go-api',
    name: 'Go API 서버',
    summary: 'Gin 라우터 뒤의 인증 · 세션 · 온보딩 진행 · 사진 처리',
    node: 'api',
  },
];
