import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import { ProcessingApiError } from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';
import { jobDetailPath } from '@snapdone/webview-bridge';
import type { Metadata } from 'next';

import { InAppReady } from '@/components/in-app-ready';
import { ProcessingResult } from '@/components/processing/processing-result';
import { LOAD_FAILED, NOT_FOUND, PAGE_TITLE } from '@/components/processing/result-copy';
import { loginPage } from '@/lib/auth/redirect';
import { readCredential, requireSession } from '@/lib/auth/session';
import { fetchJob } from '@/lib/processing-jobs/api';

/** 이 결과가 규칙에 맞는 작업 주소가 아니면 로그인 뒤 기록으로 돌아간다. */
const HISTORY = '/history';

export const metadata: Metadata = {
  title: PAGE_TITLE,
};

type Loaded = { type: 'job'; job: JobDetail } | { type: 'not-found' } | { type: 'failed' };

/** 서버의 작업. 세션이 끝났으면 로그인으로 보내고, 없는 작업 · 읽지 못함은 그렇다고 돌려준다. */
const loadJob = async (jobId: string, returnTo: string): Promise<Loaded> => {
  const credential = await readCredential();
  let job: JobDetail | null;
  try {
    job = credential ? await fetchJob(credential, jobId) : null;
  } catch (error) {
    const notFound = error instanceof ProcessingApiError && error.code === 'job_not_found';
    return { type: notFound ? 'not-found' : 'failed' };
  }
  if (!job) redirect(loginPage(returnTo));
  return { type: 'job', job };
};

/**
 * 처리 결과 하나. 브라우저와 앱 WebView가 같이 연다. 사진은 저장하지 않으므로 이 화면에는 원본이 없다 —
 * 원본을 들고 있는 처리 흐름(사진을 올린 화면)만 사진을 보이고 유형을 고르게 한다.
 */
export default async function JobResultPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  // 로그인 뒤 이 결과로 돌아온다. 작업 주소 규칙(`jobDetailPath`)에 맞을 때만이다.
  const returnTo = jobDetailPath(jobId) ?? HISTORY;
  await requireSession(returnTo);
  const loaded = await loadJob(jobId, returnTo);

  return (
    <Stack gap="xl">
      {loaded.type === 'job' ? (
        <ProcessingResult initial={loaded.job} image={null} returnTo={returnTo} />
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="typo-heading-h4">{PAGE_TITLE}</h1>
          <p role="alert" className="typo-paragraph-default">
            {loaded.type === 'not-found' ? NOT_FOUND : LOAD_FAILED}
          </p>
        </div>
      )}
      <InAppReady title={PAGE_TITLE} />
    </Stack>
  );
}
