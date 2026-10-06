import { INSPECTOR_ID, MAIN_CONTENT_ID, themeScript } from '@berrypjh/devhub-ui';
import { SkipLink } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { DevHubRoot } from '@/components/shell/devhub-root';
import { NavigationFocus } from '@/components/shell/navigation-focus';

import '@berrypjh/react-ui/styles.css';
import './global.css';

export const metadata: Metadata = {
  title: 'Snapdone DevHub',
  description: '저장소의 시나리오 · 구조 · 근거를 한곳에서 보는 내부 도구',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // head script가 hydration 전에 `data-theme`를 설정하므로 속성이 서버와 다르다.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* 건너뛰기 링크는 문서의 것이다. 라우트 밖에 두어야 이동할 때 포커스가 가지 않는다. */}
      <body>
        <NavigationFocus />
        <SkipLink targetId={MAIN_CONTENT_ID}>본문으로 건너뛰기</SkipLink>
        <SkipLink targetId={INSPECTOR_ID}>상세 정보로 건너뛰기</SkipLink>
        <DevHubRoot>{children}</DevHubRoot>
      </body>
    </html>
  );
}
