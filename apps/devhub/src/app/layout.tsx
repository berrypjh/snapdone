import { SkipLink } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { NavigationFocus } from '@/components/navigation-focus';
import { INSPECTOR_ID, MAIN_CONTENT_ID } from '@/components/workspace';
import { themeScript } from '@/lib/theme';

import '@berrypjh/react-ui/styles.css';
import './global.css';

export const metadata: Metadata = {
  title: 'Snapdone DevHub',
  description: '저장소의 시나리오 · 구조 · 근거를 한곳에서 보는 내부 도구입니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The head script sets `data-theme` before hydration, so the attribute differs from the server.
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Skip links belong to the document: kept outside the routes so no navigation focuses them. */}
      <body>
        <NavigationFocus />
        <SkipLink targetId={MAIN_CONTENT_ID}>본문으로 건너뛰기</SkipLink>
        <SkipLink targetId={INSPECTOR_ID}>상세 정보로 건너뛰기</SkipLink>
        {children}
      </body>
    </html>
  );
}
