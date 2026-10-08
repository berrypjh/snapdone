import type { SavedProgress } from '@snapdone/onboarding';

import type { OnboardingProgress } from './model';

/** 진행을 읽고 쓰는 곳. 운영에서는 서버(`progressApi`)다. 읽지 못하면 `null`이다. */
export type ProgressStore = {
  load: () => Promise<OnboardingProgress | null>;
  save: (progress: OnboardingProgress) => Promise<void>;
};

/** 서버 진행을 앱의 진행으로 바꾼다. 온보딩을 이미 마쳤으면 `null`이다. */
export const fromSaved = ({ step }: SavedProgress): OnboardingProgress | null =>
  step === 'complete' ? null : { step };
