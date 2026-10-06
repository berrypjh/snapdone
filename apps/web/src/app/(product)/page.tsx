import Link from 'next/link';

import { Box, Stack } from '@berrypjh/react-ui';

export default function Index() {
  return (
    <Stack gap="xl">
      <div>
        <h1 className="typo-heading-h4">이미지 액션 라우터</h1>
        <p className="mt-3 typo-paragraph-default text-text-light">
          사진이나 스크린샷에서 필요한 정보를 찾고,
          <br />
          해야 할 일까지 자연스럽게 이어줍니다.
        </p>
      </div>

      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        className="border-semanticBorder-divider border-stroke-light shadow-xs"
      >
        <p className="typo-caption-default text-text-light">
          초기 설정 중입니다. 화면은 아직 준비되지 않았습니다.
        </p>
      </Box>

      <Link
        href="/history"
        className="self-start typo-body-medium-strong text-text-default underline"
      >
        기록 보기
      </Link>

      <Link
        href="/settings/processing"
        className="self-start typo-body-medium-strong text-text-default underline"
      >
        기본 처리 설정
      </Link>
    </Stack>
  );
}
