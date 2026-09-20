import { redirect } from 'next/navigation';

import type { Metadata } from 'next';

import { FirstImageFlow } from '@/components/onboarding/first-image-flow';
import { requireSignedIn } from '@/lib/auth/session';
import { onboardingPath } from '@/lib/onboarding/paths';

export const metadata: Metadata = { title: '첫 사진' };

/** ON-04 · ON-05. 목적에 답하거나 건너뛴 뒤에 열린다. 사진은 파일 선택으로 받는다(브라우저 단독 접속). */
export default async function OnboardingFirstImagePage() {
  const { onboardingStep } = await requireSignedIn('/onboarding');
  if (onboardingStep !== 'first-image') redirect(onboardingPath(onboardingStep));

  return <FirstImageFlow />;
}
