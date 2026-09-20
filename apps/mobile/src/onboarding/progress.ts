import type { ProgressUpdate, SavedProgress } from '@snapdone/onboarding';

import type { OnboardingProgress } from './model';

/** 진행을 읽고 쓰는 곳. 운영에서는 서버(`progressApi`)다. 읽지 못하면 `null`이다. */
export type ProgressStore = {
  load: () => Promise<OnboardingProgress | null>;
  save: (progress: OnboardingProgress) => Promise<void>;
};

/** 서버 진행을 앱의 진행으로 바꾼다. 온보딩을 이미 마쳤으면 `null`이다. */
export const fromSaved = ({ step, purposes }: SavedProgress): OnboardingProgress | null => {
  if (step === 'complete') return null;
  if (purposes === null) return { step, purpose: { status: 'unanswered' } };
  if (purposes.length === 0) return { step, purpose: { status: 'skipped' } };
  return { step, purpose: { status: 'selected', purposes } };
};

/** 앱의 진행을 저장 요청으로 바꾼다. 건너뜀은 빈 목록, 아직 답하지 않음은 `null`이다. */
export const toUpdate = ({ step, purpose }: OnboardingProgress): ProgressUpdate => {
  switch (purpose.status) {
    case 'unanswered':
      return { step, purposes: null };
    case 'skipped':
      return { step, purposes: [] };
    case 'selected':
      return { step, purposes: purpose.purposes };
  }
};
