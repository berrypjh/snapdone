import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import { presentResult, type ProcessingResult } from '@snapdone/onboarding';

import { AuthShell } from '../components/auth/AuthShell';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import { SelectedImageFrame } from '../components/onboarding/SelectedImageFrame';
import type { SelectedImage } from '../onboarding/capture';
import { textStyle } from '../theme/text';

/** 사진 칸이 화면 높이에서 차지하는 비율. 결과가 주인공이라 처리 화면만큼 작게 둔다. */
const IMAGE_HEIGHT_RATIO = 0.3;

const COMPLETE_FAILED = '완료하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';

type OnboardingResultScreenProps = {
  image: SelectedImage;
  result: ProcessingResult;
  /** 온보딩을 끝낸다. 성공하면 앱이 홈으로 바뀌어 이 화면이 사라지고, 실패하면 던진다. */
  onComplete: () => Promise<void>;
};

/**
 * ON-06 첫 결과. 사진에서 확인한 것까지만 보이고, 추천 작업은 실행하지 않았다고 밝힌다.
 * 완료에 실패해도 사진과 결과는 그대로 두고 다시 시도한다.
 */
export const OnboardingResultScreen = ({
  image,
  result,
  onComplete,
}: OnboardingResultScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const { kind, facts, suggestion, needsReview } = presentResult(result);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };

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
        <Stack gap="sm">
          <OnboardingTitle>사진을 확인했습니다</OnboardingTitle>
          {kind && (
            <Text style={[textStyle(typography.caption.default), muted, styles.center]}>
              {kind} 사진
            </Text>
          )}
        </Stack>

        <SelectedImageFrame uri={image.uri} heightRatio={IMAGE_HEIGHT_RATIO} />

        <Stack gap="md">
          <Text accessibilityRole="header" style={[textStyle(typography.body.mediumStrong), text]}>
            사진에서 찾은 정보
          </Text>
          {facts.length > 0 ? (
            <Box
              p="lg"
              radius="lg"
              bg="background.surface"
              style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
            >
              <Stack gap="md">
                {facts.map((fact, index) => (
                  <View key={index} accessible accessibilityLabel={`${fact.label}, ${fact.value}`}>
                    <Text
                      lineBreakStrategyIOS="hangul-word"
                      style={[textStyle(typography.caption.default), muted]}
                    >
                      {fact.label}
                    </Text>
                    <Text
                      lineBreakStrategyIOS="hangul-word"
                      style={[textStyle(typography.paragraph.default), text]}
                    >
                      {fact.value}
                    </Text>
                  </View>
                ))}
              </Stack>
            </Box>
          ) : (
            <Text style={[textStyle(typography.paragraph.default), muted]}>
              사진에서 읽은 정보가 없습니다.
            </Text>
          )}
          {needsReview && facts.length > 0 && (
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[textStyle(typography.caption.default), muted]}
            >
              일부 정보는 사진과 함께 확인해 주세요.
            </Text>
          )}
        </Stack>

        {suggestion && (
          <Stack gap="xs">
            <Text
              accessibilityRole="header"
              style={[textStyle(typography.body.mediumStrong), text]}
            >
              추천 작업
            </Text>
            <Text style={[textStyle(typography.paragraph.default), text]}>{suggestion}</Text>
            <Text style={[textStyle(typography.caption.default), muted]}>
              아직 이 작업을 실행하지 않았습니다.
            </Text>
          </Stack>
        )}

        <Stack gap="sm">
          {failed && (
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[textStyle(typography.paragraph.default), text, styles.center]}
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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
