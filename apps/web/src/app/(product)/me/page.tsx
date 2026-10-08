import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import { toLoaded } from '@snapdone/processing';
import { SlidersHorizontal, SunMoon, UserRound } from 'lucide-react';
import type { Metadata } from 'next';

import { LogoutButton } from '@/components/auth/logout-button';
import {
  ACCOUNT_TITLE,
  DISPLAY_TITLE,
  PAGE_TITLE,
  PATH,
  PREFERENCES_TITLE,
} from '@/components/me/me-copy';
import { PreferenceSummary } from '@/components/me/preference-summary';
import { SectionCard } from '@/components/section-card';
import { ThemeSwitch } from '@/components/theme-switch';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { fetchPreferences } from '@/lib/processing-preferences/api';

export const metadata: Metadata = { title: PAGE_TITLE };

/** 내 정보. 자주 바꾸지 않는 것 — 기본 처리 설정 · 화면 테마 · 로그아웃을 한곳에 모은다. */
export default async function MePage() {
  await requireSession(PATH);
  const credential = await readCredential();
  const preferences = credential ? await toLoaded(fetchPreferences(credential)) : null;
  if (!preferences) redirect(loginPage(PATH));

  return (
    <Stack gap="xl">
      <h1 className="typo-heading-h4">{PAGE_TITLE}</h1>
      <SectionCard title={PREFERENCES_TITLE} icon={<SlidersHorizontal aria-hidden size={20} />}>
        <PreferenceSummary preferences={preferences} />
      </SectionCard>
      <SectionCard title={DISPLAY_TITLE} icon={<SunMoon aria-hidden size={20} />}>
        <ThemeSwitch />
      </SectionCard>
      <SectionCard title={ACCOUNT_TITLE} icon={<UserRound aria-hidden size={20} />}>
        <LogoutButton className="self-start" />
      </SectionCard>
    </Stack>
  );
}
