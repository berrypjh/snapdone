import { type OnboardingStep, toOnboardingStep } from '@snapdone/auth-contracts';

import { isRecord } from './record';

/** 온보딩 도중 저장할 수 있는 단계. `complete`는 온보딩을 끝내는 단계가 만든다. */
export type ResumeStep = Exclude<OnboardingStep, 'complete'>;

/** 서버에 저장된 온보딩 진행(`GET` · `PUT /v1/onboarding`). mobile과 web이 같은 값을 읽고 쓴다. */
export type SavedProgress = { step: OnboardingStep };

/** 온보딩 완료(`POST /v1/onboarding/complete`) 뒤의 진행. */
export type CompletedProgress = { step: 'complete' };

/** 저장 요청 본문. */
export type ProgressUpdate = { step: ResumeStep };

/** 응답 본문에서 진행만 꺼낸다. 단계가 계약 밖이면 `null`이다. */
export const parseSavedProgress = (value: unknown): SavedProgress | null => {
  if (!isRecord(value)) return null;
  const step = toOnboardingStep(value.step);
  return step ? { step } : null;
};

/** 완료 응답 본문에서 진행만 꺼낸다. 진행 응답과 같은 모양이고, `complete`가 아니면 `null`이다. */
export const parseCompletedProgress = (value: unknown): CompletedProgress | null =>
  parseSavedProgress(value)?.step === 'complete' ? { step: 'complete' } : null;
