import { redirect } from 'next/navigation';

import { Box, Button, Stack } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { LogoutButton } from '@/components/auth/logout-button';
import { InAppReady } from '@/components/in-app-ready';
import { requireSignedIn } from '@/lib/auth/session';
import { isInAppRequest } from '@/lib/in-app';
import { startOnboarding } from '@/lib/onboarding/actions';
import { onboardingPath } from '@/lib/onboarding/paths';

const TITLE = '서비스 소개';

/** 소개 예시. 입력 → 사진에서 확인하는 것. 지금 처리하는 영수증 · 외국어만 들고, 실행하지 않는 일은 약속하지 않는다. */
const EXAMPLES = [
  { source: '영수증', detail: '12,000원', result: '금액 · 가게 확인' },
  { source: '외국어 안내문', detail: 'Exit only', result: '번역할 문장 확인' },
] as const;

export const metadata: Metadata = { title: TITLE };

/**
 * 서비스 소개. 진행은 서버에 있어 mobile에서 더 진행했다면 그 단계로 보낸다.
 * 시작하기가 첫 사진으로 넘긴다.
 */
export default async function OnboardingPage() {
  const session = await requireSignedIn('/onboarding');
  if (session.onboardingStep !== 'intro') redirect(onboardingPath(session.onboardingStep));
  const inApp = await isInAppRequest();

  return (
    <Stack gap="xl">
      <h1 className="text-center typo-heading-h4">
        사진 한 장으로
        <br />
        필요한 정보를 찾아 드립니다.
      </h1>

      <ul className="flex flex-col gap-3">
        {EXAMPLES.map((example) => (
          <li key={example.source}>
            <Box
              p="lg"
              bg="background.surface"
              radius="lg"
              className="border border-stroke-light text-center"
            >
              <p className="typo-caption-default text-text-light">{example.source}</p>
              <p className="typo-body-medium-strong">{example.detail}</p>
              <p aria-hidden="true" className="typo-caption-default text-text-light">
                ↓
              </p>
              <p className="typo-paragraph-default">
                {example.result}
                <span aria-hidden="true"> ✓</span>
              </p>
            </Box>
          </li>
        ))}
      </ul>

      <form action={startOnboarding}>
        <Button type="submit" variant="contained" size="lg" fullWidth>
          시작하기
        </Button>
      </form>

      {!inApp && <LogoutButton className="flex justify-center" />}

      <InAppReady title={TITLE} />
    </Stack>
  );
}
