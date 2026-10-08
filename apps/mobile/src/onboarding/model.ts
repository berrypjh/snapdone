import type { ResumeStep } from '@snapdone/onboarding';

/**
 * 서버에 저장되는 진행 단계. 사진 확인 · 처리 단계는 일부러 없다 —
 * 그 도중에 앱이 꺼지면 첫 사진 단계로 돌아간다.
 */
export type OnboardingProgress = { step: ResumeStep };

export type OnboardingEvent = { type: 'start' };

export const initialProgress: OnboardingProgress = { step: 'intro' };

/** 바뀐 것이 없으면 같은 객체를 돌려준다. 연속 탭으로 같은 사건이 두 번 와도 한 번과 같다. */
export const onboardingReducer = (
  progress: OnboardingProgress,
  event: OnboardingEvent,
): OnboardingProgress => {
  switch (event.type) {
    case 'start':
      return progress.step === 'intro' ? { step: 'first-image' } : progress;
  }
};
