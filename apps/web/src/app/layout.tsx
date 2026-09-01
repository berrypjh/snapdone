import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';

import './global.css';

export const metadata: Metadata = {
  title: '이미지 액션 라우터',
  description: '사진이나 스크린샷에서 필요한 정보를 찾고, 해야 할 일까지 자연스럽게 이어줍니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
