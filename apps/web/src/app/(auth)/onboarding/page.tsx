import { redirect } from 'next/navigation';

import { Box, Button, Stack } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { InAppReady } from '@/components/in-app-ready';
import { logout } from '@/lib/auth/actions';
import { requireSignedIn } from '@/lib/auth/session';
import { isInAppRequest } from '@/lib/in-app';

const TITLE = '서비스 소개';

/** ON-02 원문 예시. 입력 → 끝난 일. */
const EXAMPLES = [
  { source: '영수증', detail: '6,500원', result: '지출 기록 완료' },
  { source: '공연 포스터', detail: '8월 25일', result: '캘린더 등록' },
  { source: '맛집 캡처', detail: '성수 ○○카페', result: '서울 맛집 저장' },
] as const;

export const metadata: Metadata = { title: TITLE };

/** ON-02. 다음 단계(ON-03)가 없어 시작하기는 준비 중이다. 이 page를 봤다고 온보딩을 끝내지 않는다. */
export default async function OnboardingPage() {
  const session = await requireSignedIn('/onboarding');
  if (session.onboardingStep === 'complete') redirect('/');
  const inApp = await isInAppRequest();

  return (
    <Stack gap="xl">
      <h1 className="text-center typo-heading-h4">
        사진 한 장으로
        <br />
        해야 할 일을 끝내세요.
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

      <Stack gap="sm">
        <Button type="button" disabled fullWidth>
          시작하기
        </Button>
        <p className="text-center typo-caption-default text-text-light">
          다음 단계는 준비 중입니다.
        </p>
      </Stack>

      {!inApp && (
        <form action={logout} className="flex justify-center">
          <Button type="submit" variant="text" size="sm">
            로그아웃
          </Button>
        </form>
      )}

      <InAppReady title={TITLE} />
    </Stack>
  );
}
