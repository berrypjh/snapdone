import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, StyleSheet, Text, View } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { AuthShell } from '../components/auth/AuthShell';
import { type CaptureNotice, captureNotice } from '../components/onboarding/captureCopy';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import { type CaptureSource, createImageCapture, type SelectedImage } from '../onboarding/capture';
import { systemImageCapture } from '../onboarding/imagePicker';
import { textStyle } from '../theme/text';

const EXAMPLES = ['영수증', '외국어가 있는 사진'] as const;

type OnboardingFirstImageScreenProps = { onSelected: (image: SelectedImage) => void };

/**
 * ON-04 첫 이미지 추가. 사진에서 선택 · 카메라로 촬영 중 하나로 한 장을 받는다.
 * 권한은 카메라를 누른 순간에만 묻고, 취소는 아무 안내 없이 이 화면에 머문다.
 */
export const OnboardingFirstImageScreen = ({ onSelected }: OnboardingFirstImageScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [capture] = useState(() => createImageCapture(systemImageCapture));
  const [busy, setBusy] = useState<CaptureSource | null>(null);
  const [notice, setNotice] = useState<CaptureNotice | null>(null);
  const muted = { color: getColor(theme, 'text.light') };

  useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(notice.message);
  }, [notice]);

  const choose = async (source: CaptureSource) => {
    setNotice(null);
    setBusy((current) => current ?? source);
    const result = await capture(source);
    if (!result) return;
    setBusy(null);
    if (result.type === 'selected') onSelected(result.image);
    else setNotice(captureNotice(result));
  };

  return (
    <AuthShell edges={['bottom', 'left', 'right']}>
      <Stack gap="xl">
        <Stack gap="sm">
          <OnboardingTitle>첫 번째 사진을{'\n'}처리해볼까요?</OnboardingTitle>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={[textStyle(typography.paragraph.default), muted, styles.center]}
          >
            영수증이나 외국어가 있는 사진을 올려 보세요.
          </Text>
        </Stack>

        <Stack gap="sm">
          <Button
            variant="contained"
            size="lg"
            fullWidth
            loading={busy === 'library'}
            disabled={busy !== null}
            onPress={() => void choose('library')}
          >
            사진에서 선택
          </Button>
          <Button
            variant="outlined"
            size="lg"
            fullWidth
            loading={busy === 'camera'}
            disabled={busy !== null}
            onPress={() => void choose('camera')}
          >
            카메라로 촬영
          </Button>
        </Stack>

        {notice && (
          <Box p="lg" radius="md" bg="background.grey">
            <Stack gap="sm">
              <Text
                style={[
                  textStyle(typography.paragraph.small),
                  { color: getColor(theme, 'text.default') },
                ]}
              >
                {notice.message}
              </Text>
              {notice.openSettings && (
                <Button variant="outlined" size="sm" onPress={() => void Linking.openSettings()}>
                  설정 열기
                </Button>
              )}
            </Stack>
          </Box>
        )}

        <View accessible accessibilityLabel={`추천: ${EXAMPLES.join(', ')}`}>
          <Text style={[textStyle(typography.caption.default), muted, styles.center]}>추천</Text>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={[textStyle(typography.caption.default), muted, styles.center]}
          >
            {EXAMPLES.join(' · ')}
          </Text>
        </View>
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
