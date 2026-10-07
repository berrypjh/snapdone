import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import { needsCheck, recentState } from '@snapdone/processing';

import { AddPhoto } from '@/components/home/add-photo';
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  PREFERENCES_TITLE,
  RECENT_EMPTY,
  RECENT_FAILED,
  RECENT_TITLE,
  REVIEW_EMPTY,
  REVIEW_TITLE,
} from '@/components/home/home-copy';
import { HomeSection } from '@/components/home/home-section';
import { PreferenceSummary } from '@/components/home/preference-summary';
import { RecentJobs } from '@/components/home/recent-jobs';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { loadHome } from '@/lib/home/home';

const PATH = '/';

/**
 * 홈. 온보딩 뒤 처리한 사진(general 작업)이 없으면 사진 추가 · 설정 · 빈 기록 순으로, 있으면 사진 추가 · 최근 처리 ·
 * 확인 필요 · 설정 순으로 보인다. 처리 기록을 읽지 못하면 비었다고 추측하지 않고 그렇다고 말한다.
 * 요청마다 서버에서 다시 읽는다(`apiFetch`는 `no-store`) — 처리 · 설정을 바꾸고 돌아오면 바뀐 값이 보인다.
 */
export default async function HomePage() {
  await requireSession(PATH);
  const credential = await readCredential();
  const home = credential ? await loadHome(credential) : null;
  if (!home) redirect(loginPage(PATH));
  const state = recentState(home.recent);
  // 확인이 필요한 처리는 서버 결과에 확인이 필요한 영수증 값이 있을 때만이다.
  const review = home.recent.ok ? home.recent.value.filter(needsCheck) : [];

  const preferences = (
    <HomeSection title={PREFERENCES_TITLE}>
      <PreferenceSummary preferences={home.preferences} />
    </HomeSection>
  );

  return (
    <Stack gap="xl">
      <div>
        <h1 className="typo-heading-h4">{HOME_TITLE}</h1>
        <p className="mt-3 typo-paragraph-default text-text-light">{HOME_DESCRIPTION}</p>
      </div>

      <AddPhoto />

      {state === 'empty' && preferences}

      <HomeSection title={RECENT_TITLE}>
        {home.recent.ok ? (
          home.recent.value.length > 0 ? (
            <RecentJobs jobs={home.recent.value} />
          ) : (
            <p className="typo-paragraph-default text-text-light">{RECENT_EMPTY}</p>
          )
        ) : (
          <p role="alert" className="typo-paragraph-default text-text-error">
            {RECENT_FAILED}
          </p>
        )}
      </HomeSection>

      {state === 'active' && (
        <HomeSection title={REVIEW_TITLE}>
          {review.length > 0 ? (
            <RecentJobs jobs={review} />
          ) : (
            <p className="typo-paragraph-default text-text-light">{REVIEW_EMPTY}</p>
          )}
        </HomeSection>
      )}

      {state !== 'empty' && preferences}
    </Stack>
  );
}
