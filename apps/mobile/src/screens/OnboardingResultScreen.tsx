import { type ComponentProps, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { AuthShell } from '../components/auth/AuthShell';
import { ResultBody } from '../components/processing/ResultBody';
import { textStyle } from '../theme/text';

const COMPLETE_FAILED = '완료하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';

type OnboardingResultScreenProps = ComponentProps<typeof ResultBody> & {
  /** 온보딩을 끝낸다. 성공하면 앱이 홈으로 바뀌어 이 화면이 사라지고, 실패하면 던진다. */
  onComplete: () => Promise<void>;
};

/**
 * 첫 결과. 서버가 실제로 처리한 결과와 적용한 처리 방식을 홈의 사진 추가와 같은 `ResultBody`로 보이고,
 * 같은 사진을 다른 방식으로 다시 처리할 수 있다. 완료를 눌러야만 서버가 온보딩을 끝낸다.
 * 완료에 실패해도 사진과 결과는 그대로 두고 다시 시도한다.
 */
export const OnboardingResultScreen = ({ onComplete, ...body }: OnboardingResultScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) AccessibilityInfo.announceForAccessibility(COMPLETE_FAILED);
  }, [failed]);

  const complete = async () => {
    setPending(true);
    setFailed(false);
    try {
      await onComplete();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell edges={['bottom', 'left', 'right']}>
      <Stack gap="xl">
        <ResultBody {...body} />
        <Stack gap="sm">
          {failed && (
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[
                textStyle(typography.paragraph.default),
                { color: getColor(theme, 'text.default') },
                styles.center,
              ]}
            >
              {COMPLETE_FAILED}
            </Text>
          )}
          <Button
            variant="contained"
            size="lg"
            fullWidth
            loading={pending}
            disabled={pending}
            onPress={() => void complete()}
          >
            완료
          </Button>
        </Stack>
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
