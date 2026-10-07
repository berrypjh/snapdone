import { Button, Stack } from '@berrypjh/react-native-ui';
import { isProcessed } from '@snapdone/processing';
import type { ComponentProps } from 'react';

import { AppShell } from '../components/AppShell';
import { ResultBody } from '../components/processing/ResultBody';
import { CHOOSE_ANOTHER, GO_HOME, PROCESS_ANOTHER } from '../components/processing/resultCopy';

type PhotoResultScreenProps = ComponentProps<typeof ResultBody> & {
  onChooseAnother: () => void;
  onHome: () => void;
};

/**
 * 홈에서 추가해 지금 처리한 사진의 결과. 결과 내용은 온보딩 첫 사진과 같은 `ResultBody`이고,
 * 이 화면은 다른 사진으로 넘어가거나 홈으로 돌아가는 길을 둔다. 지난 기록은 사진이 없으므로 web 기록 화면의 몫이다.
 */
export const PhotoResultScreen = ({ onChooseAnother, onHome, ...body }: PhotoResultScreenProps) => {
  const processed = isProcessed(body.initial);

  return (
    <AppShell>
      <ResultBody {...body} />
      <Stack gap="sm">
        <Button
          variant={processed ? 'outlined' : 'contained'}
          size="lg"
          fullWidth
          onPress={onChooseAnother}
        >
          {processed ? PROCESS_ANOTHER : CHOOSE_ANOTHER}
        </Button>
        <Button variant="text" fullWidth onPress={onHome}>
          {GO_HOME}
        </Button>
      </Stack>
    </AppShell>
  );
};
