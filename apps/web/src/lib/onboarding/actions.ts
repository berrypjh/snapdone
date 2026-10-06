'use server';

import { redirect } from 'next/navigation';

import {
  isPurpose,
  isPurposeSelection,
  orderPurposes,
  ProcessingApiError,
  type ProcessingJob,
  type ProgressUpdate,
  type SavedProgress,
} from '@snapdone/onboarding';

import { loginPage } from '../auth/redirect';
import { fromAllowedOrigin, readCredential } from '../auth/session';

import {
  completeProgress,
  fetchProcessingJob,
  fetchProgress,
  ProgressConflictError,
  saveProgress,
  startProcessingJob,
} from './api';
import { onboardingPath } from './paths';

const LOGIN = loginPage('/onboarding');

/** 허용된 origin의 요청이면 세션 credential을 돌려준다. 로그인이 없으면 `null`이다. */
const credentialFromAllowedOrigin = async (): Promise<string | null> => {
  if (!(await fromAllowedOrigin())) throw new Error('허용되지 않은 origin의 온보딩 요청입니다.');
  return readCredential();
};

/** 다른 기기 · 탭이 먼저 진행을 바꿨으면(409) 서버의 지금 진행을 따른다. */
const orCurrent = (credential: string, request: Promise<SavedProgress | null>) =>
  request.catch((error: unknown) => {
    if (!(error instanceof ProgressConflictError)) throw error;
    return fetchProgress(credential);
  });

const save = (credential: string, update: ProgressUpdate) =>
  orCurrent(credential, saveProgress(credential, update));

/** 진행을 저장하고 서버의 단계에 맞는 page로 보낸다. 로그인이 없으면 로그인으로. */
const saveAndContinue = async (credential: string | null, update: ProgressUpdate) => {
  const saved = credential ? await save(credential, update) : null;
  redirect(saved ? onboardingPath(saved.step) : LOGIN);
};

/** 소개에서 목적 선택으로. 이미 더 진행했다면 그 단계로 보낸다. */
export async function startOnboarding(): Promise<void> {
  const credential = await credentialFromAllowedOrigin();
  const progress = credential ? await fetchProgress(credential) : null;
  if (!progress) redirect(LOGIN);
  if (progress.step !== 'intro') redirect(onboardingPath(progress.step));
  await saveAndContinue(credential, { step: 'purpose', purposes: null });
}

/** 고른 목적을 남기고 첫 사진으로. 선택 규칙에 맞지 않으면 목적 선택에 머문다. */
export async function choosePurposes(form: FormData): Promise<void> {
  const purposes = orderPurposes(form.getAll('purpose').filter(isPurpose));
  if (!isPurposeSelection(purposes)) redirect('/onboarding/purpose');
  await saveAndContinue(await credentialFromAllowedOrigin(), { step: 'first-image', purposes });
}

/** 목적을 건너뛴 사실을 남기고 첫 사진으로. */
export async function skipPurpose(): Promise<void> {
  await saveAndContinue(await credentialFromAllowedOrigin(), { step: 'first-image', purposes: [] });
}

/** 완료 Action이 돌아왔다면 실패다. 성공 · 로그인 만료 · 단계 어긋남은 redirect로 끝난다. */
export type CompletionResponse = { type: 'error' };

/**
 * ON-06에서 온보딩을 끝내고 홈으로. 이미 다른 곳에서 마쳤어도 홈으로 간다.
 * 서버 진행이 아직 첫 사진 전이면 그 단계로 보낸다. 서버에 닿지 못하면 값으로 돌려줘 결과 화면에서 다시 시도한다.
 */
export async function completeOnboarding(): Promise<CompletionResponse> {
  const credential = await credentialFromAllowedOrigin();
  if (!credential) redirect(LOGIN);
  let progress: SavedProgress | null;
  try {
    progress = await orCurrent(credential, completeProgress(credential));
  } catch {
    return { type: 'error' };
  }
  redirect(progress ? onboardingPath(progress.step) : LOGIN);
}

/** 처리 Action의 결과. 오류는 던지지 않고 값으로 돌려준다 — production에서 Action 오류 내용은 가려진다. */
export type JobResponse =
  { type: 'job'; job: ProcessingJob } | { type: 'signed-out' } | { type: 'error'; code: string };

const respond = async (call: (credential: string) => Promise<ProcessingJob | null>) => {
  const credential = await credentialFromAllowedOrigin();
  if (!credential) return { type: 'signed-out' } as const;
  try {
    const job = await call(credential);
    return job ? ({ type: 'job', job } as const) : ({ type: 'signed-out' } as const);
  } catch (error) {
    if (error instanceof ProcessingApiError) return { type: 'error', code: error.code } as const;
    throw error;
  }
};

/** 첫 사진 처리를 시작한다. 사진은 multipart 필드 `image` 하나다. */
export async function startFirstImage(form: FormData): Promise<JobResponse> {
  const image = form.get('image');
  if (!(image instanceof Blob)) return { type: 'error', code: 'invalid_image' };
  return respond((credential) => startProcessingJob(credential, image));
}

export async function findFirstImageJob(jobId: string): Promise<JobResponse> {
  return respond((credential) => fetchProcessingJob(credential, jobId));
}
