import type { OnboardingStep } from '@snapdone/auth-contracts';

/** 온보딩 단계마다 이어서 열 page. 마친 사용자는 홈으로 간다. mobile의 `RESUME_ROUTE`와 같은 순서다. */
const PATHS: Record<OnboardingStep, string> = {
  intro: '/onboarding',
  'first-image': '/onboarding/first-image',
  complete: '/',
};

export const onboardingPath = (step: OnboardingStep): string => PATHS[step];
