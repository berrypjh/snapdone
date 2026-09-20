import { redirect } from 'next/navigation';

import { Stack } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { PurposeForm } from '@/components/onboarding/purpose-form';
import { readCredential, requireSignedIn } from '@/lib/auth/session';
import { fetchProgress } from '@/lib/onboarding/api';
import { onboardingPath } from '@/lib/onboarding/paths';

export const metadata: Metadata = { title: '사용 목적' };

/** ON-03. 소개를 지나야 열린다. 첫 사진 단계에서 돌아오면 저장된 목적을 미리 골라 둔다. */
export default async function OnboardingPurposePage() {
  const session = await requireSignedIn('/onboarding');
  const { onboardingStep } = session;
  if (onboardingStep === 'intro' || onboardingStep === 'complete') {
    redirect(onboardingPath(onboardingStep));
  }

  const credential = await readCredential();
  const progress = credential ? await fetchProgress(credential) : null;
  const saved = progress?.purposes ?? [];

  return (
    <Stack gap="xl">
      <div className="text-center">
        <h1 className="typo-heading-h4">
          주로 어떤 사진을
          <br />
          정리하고 싶으세요?
        </h1>
        <p className="mt-2 typo-caption-default text-text-light">여러 개를 고를 수 있습니다.</p>
      </div>
      <PurposeForm initialSelection={saved} />
    </Stack>
  );
}
