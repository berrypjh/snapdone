import type { Metadata } from 'next';

import { themeInitScript } from '@/lib/theme';

import '@berrypjh/react-ui/styles.css';
import './global.css';

/**
 * 디자인 토큰의 첫 글꼴(Pretendard)을 실제로 불러온다. 없으면 Apple SD Gothic Neo · Malgun Gothic으로 그린다.
 * 가변 글꼴의 dynamic subset이라 화면에 쓴 글자 묶음만 내려받는다.
 */
const PRETENDARD_CSS =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css';

export const metadata: Metadata = {
  title: '이미지 액션 라우터',
  description: '사진이나 스크린샷에서 필요한 정보를 찾고, 해야 할 일까지 자연스럽게 이어줍니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={PRETENDARD_CSS} crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
