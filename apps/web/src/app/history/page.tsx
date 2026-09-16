import { Box, Stack } from '@berrypjh/react-ui';
import type { Metadata } from 'next';

import { InAppReady } from '@/components/in-app-ready';

const TITLE = '기록';

export const metadata: Metadata = {
  title: TITLE,
};

export default function HistoryPage() {
  return (
    <Stack gap="xl">
      <h1 className="typo-heading-h4">{TITLE}</h1>

      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        className="border-semanticBorder-divider border-stroke-light shadow-xs"
      >
        <p className="typo-paragraph-default">아직 기록이 없습니다.</p>
        <p className="mt-1 typo-caption-default text-text-light">
          사진이나 스크린샷을 넣으면 처리한 일이 여기에 남습니다.
        </p>
      </Box>

      <InAppReady title={TITLE} />
    </Stack>
  );
}
