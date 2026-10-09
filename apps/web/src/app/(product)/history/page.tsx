import { redirect } from 'next/navigation';

import { Box, Stack } from '@berrypjh/react-ui';
import type { RecentJob } from '@snapdone/processing';
import type { Metadata } from 'next';

import { HistoryList } from '@/components/history/history-list';
import { InAppReady } from '@/components/in-app-ready';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { fetchRecentJobs } from '@/lib/processing-jobs/api';
import { groupByDay } from '@/lib/processing-jobs/days';

const TITLE = '기록';
const PATH = '/history';
const LOAD_FAILED = '처리 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

export const metadata: Metadata = {
  title: TITLE,
};

/** 서버의 최근 처리 기록. 세션이 끝났으면 로그인으로, 읽지 못했으면 `null`이다 — 비었다고 추측하지 않는다. */
const loadJobs = async (): Promise<RecentJob[] | null> => {
  const credential = await readCredential();
  let jobs: RecentJob[] | null;
  try {
    jobs = credential ? await fetchRecentJobs(credential) : null;
  } catch {
    return null;
  }
  if (!jobs) redirect(loginPage(PATH));
  return jobs;
};

/**
 * 처리 기록. 처리한 사진(온보딩 첫 사진 포함)의 최근 기록을 서버에서 읽어 한국 날짜(오늘 · 어제 · 날짜)로 묶는다.
 * 기록 하나를 열면 그 처리 결과다. 한 건은 결과 화면에서, 여러 건은 이 목록의 선택으로 지운다.
 * 사진은 저장하지 않으므로 기록에는 사진이 없고, 같은 사진으로 다시 처리할 수도 없다.
 */
export default async function HistoryPage() {
  await requireSession(PATH);
  const jobs = await loadJobs();

  return (
    <Stack gap="xl">
      {/* 기록이 있으면 목록이 제목 줄에 "선택"을 함께 둔다. */}
      {jobs?.length ? null : <h1 className="typo-heading-h4 in-app:sr-only">{TITLE}</h1>}

      {jobs === null ? (
        <p role="alert" className="typo-paragraph-default text-text-error">
          {LOAD_FAILED}
        </p>
      ) : jobs.length > 0 ? (
        <HistoryList title={TITLE} groups={groupByDay(jobs, new Date())} />
      ) : (
        <Box
          p="xl"
          bg="background.surface"
          radius="lg"
          className="border-semanticBorder-divider border-stroke-light shadow-xs"
        >
          <p className="typo-paragraph-default">아직 기록이 없습니다.</p>
          <p className="mt-1 typo-caption-default text-text-light">
            사진이나 스크린샷을 넣으면 처리한 일이 여기에 남습니다.
          </p>
        </Box>
      )}

      <InAppReady title={TITLE} />
    </Stack>
  );
}
