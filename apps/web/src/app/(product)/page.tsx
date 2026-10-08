import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import { HOME_LIST_LIMIT, needsCheck, recentState, toLoaded } from '@snapdone/processing';
import { ChevronRight } from 'lucide-react';

import { AddPhoto } from '@/components/home/add-photo';
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  PREFERENCES_HINT,
  RECENT_EMPTY,
  RECENT_FAILED,
  RECENT_TITLE,
  REVIEW_EMPTY,
  REVIEW_TITLE,
  SEE_ALL,
} from '@/components/home/home-copy';
import { PAGE_TITLE as ME_TITLE, PATH as ME_PATH } from '@/components/me/me-copy';
import { RecentJobs } from '@/components/recent-jobs';
import { SectionCard } from '@/components/section-card';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { fetchRecentJobs } from '@/lib/processing-jobs/api';

const PATH = '/';

const TEXT_LINK =
  'inline-flex min-h-11 items-center gap-1 typo-caption-default text-text-link underline-offset-4 hover:underline';

/**
 * 홈. 사진 추가 · 최근 처리 · 확인이 필요한 처리만 둔다 — 처리 방식은 내 정보에서 바꾼다.
 * 처리한 사진(온보딩 첫 사진 포함)이 없으면 빈 기록과 처리 방식을 바꿀 곳을 알려 주고,
 * 처리 기록을 읽지 못하면 비었다고 추측하지 않고 그렇다고 말한다.
 * 두 목록은 최근 것부터 `HOME_LIST_LIMIT`개만 보이고, 나머지는 기록(전체 보기)에서 본다.
 * 요청마다 서버에서 다시 읽는다(`apiFetch`는 `no-store`) — 처리하고 돌아오면 바뀐 값이 보인다.
 */
export default async function HomePage() {
  await requireSession(PATH);
  const credential = await readCredential();
  const recent = credential ? await toLoaded(fetchRecentJobs(credential)) : null;
  if (!recent) redirect(loginPage(PATH));
  const state = recentState(recent);
  // 확인이 필요한 처리는 서버 결과에 확인이 필요한 영수증 값이 있을 때만이다.
  const review = recent.ok ? recent.value.filter(needsCheck) : [];

  return (
    <Stack gap="xl">
      <div>
        <h1 className="typo-heading-h4">{HOME_TITLE}</h1>
        <p className="mt-3 typo-paragraph-default text-text-light">{HOME_DESCRIPTION}</p>
      </div>

      <AddPhoto />

      <SectionCard
        title={RECENT_TITLE}
        action={
          state === 'active' && (
            <Link href="/history" className={TEXT_LINK}>
              {SEE_ALL}
              <ChevronRight aria-hidden size={16} />
            </Link>
          )
        }
      >
        {recent.ok ? (
          recent.value.length > 0 ? (
            <RecentJobs jobs={recent.value.slice(0, HOME_LIST_LIMIT)} />
          ) : (
            <p className="typo-paragraph-default text-text-light">{RECENT_EMPTY}</p>
          )
        ) : (
          <p role="alert" className="typo-paragraph-default text-text-error">
            {RECENT_FAILED}
          </p>
        )}
      </SectionCard>

      {state === 'active' && (
        <SectionCard title={REVIEW_TITLE}>
          {review.length > 0 ? (
            <RecentJobs jobs={review.slice(0, HOME_LIST_LIMIT)} />
          ) : (
            <p className="typo-paragraph-default text-text-light">{REVIEW_EMPTY}</p>
          )}
        </SectionCard>
      )}

      {state === 'empty' && (
        <p className="typo-paragraph-default text-text-light">
          {PREFERENCES_HINT}{' '}
          <Link href={ME_PATH} className="text-text-link underline">
            {ME_TITLE}
          </Link>
        </p>
      )}
    </Stack>
  );
}
