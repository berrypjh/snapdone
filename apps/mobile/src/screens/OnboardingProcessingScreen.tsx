import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text } from 'react-native';

import { Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import {
  type ProcessingPort,
  type ProcessingResult,
  type ProcessingState,
  runProcessing,
} from '@snapdone/onboarding';

import { AuthShell } from '../components/auth/AuthShell';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import {
  FAILED_TITLE,
  FAILURE_COPY,
  PROCESSING_MESSAGE,
} from '../components/onboarding/processingCopy';
import { SelectedImageFrame } from '../components/onboarding/SelectedImageFrame';
import type { SelectedImage } from '../onboarding/capture';
import { textStyle } from '../theme/text';

/** 사진 칸이 화면 높이에서 차지하는 비율. 확인 화면보다 작게 둔다. */
const IMAGE_HEIGHT_RATIO = 0.3;

type OnboardingProcessingScreenProps = {
  image: SelectedImage;
  port: ProcessingPort<SelectedImage>;
  onCompleted: (result: ProcessingResult) => void;
  onChooseAnother: () => void;
};

/**
 * ON-05 첫 처리. 사진을 서버에 보내고 작업이 끝날 때까지 기다린다.
 * 서버가 알려주는 것은 처리 중 · 완료 · 실패뿐이라 중간 단계를 지어내지 않는다.
 * 화면을 떠나면 조회를 멈춘다.
 */
export const OnboardingProcessingScreen = ({
  image,
  port,
  onCompleted,
  onChooseAnother,
}: OnboardingProcessingScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const completedRef = useRef(onCompleted);
  const [state, setState] = useState<ProcessingState>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const failure = state.status === 'failed' ? FAILURE_COPY[state.reason] : null;
  completedRef.current = onCompleted;

  useEffect(() => {
    let stopped = false;
    void runProcessing(
      port,
      image,
      (next) => {
        setState(next);
        if (next.status === 'completed') completedRef.current(next.result);
      },
      () => stopped,
    );
    return () => {
      stopped = true;
    };
  }, [port, image, attempt]);

  useEffect(() => {
    if (failure) AccessibilityInfo.announceForAccessibility(failure.message);
  }, [failure]);

  return (
    <AuthShell edges={['bottom', 'left', 'right']}>
      <Stack gap="xl">
        <OnboardingTitle>{failure ? FAILED_TITLE : PROCESSING_MESSAGE}</OnboardingTitle>

        <SelectedImageFrame uri={image.uri} heightRatio={IMAGE_HEIGHT_RATIO} />

        {failure ? (
          <Stack gap="md">
            <Text
              style={[
                textStyle(typography.paragraph.default),
                { color: getColor(theme, 'text.default') },
                styles.center,
              ]}
            >
              {failure.message}
            </Text>
            <Stack gap="sm">
              {failure.retry && (
                <Button
                  variant="contained"
                  size="lg"
                  fullWidth
                  onPress={() => setAttempt((count) => count + 1)}
                >
                  다시 시도
                </Button>
              )}
              <Button
                variant={failure.retry ? 'text' : 'contained'}
                size={failure.retry ? 'md' : 'lg'}
                fullWidth
                onPress={onChooseAnother}
              >
                다른 사진 선택
              </Button>
            </Stack>
          </Stack>
        ) : (
          <ActivityIndicator
            size="large"
            color={getColor(theme, 'text.light')}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        )}
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
