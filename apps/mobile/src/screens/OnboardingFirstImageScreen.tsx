import { StyleSheet, Text, View } from 'react-native';

import { getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { AuthShell } from '../components/auth/AuthShell';
import { CaptureChoices } from '../components/capture/CaptureChoices';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import type { SelectedImage } from '../onboarding/capture';
import { textStyle } from '../theme/text';

const EXAMPLES = ['영수증', '외국어가 있는 사진'] as const;

type OnboardingFirstImageScreenProps = { onSelected: (image: SelectedImage) => void };

/**
 * 첫 이미지 추가. 사진에서 선택 · 카메라로 촬영 중 하나로 한 장을 받는다.
 * 권한은 카메라를 누른 순간에만 묻고, 취소는 아무 안내 없이 이 화면에 머문다.
 */
export const OnboardingFirstImageScreen = ({ onSelected }: OnboardingFirstImageScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const muted = { color: getColor(theme, 'text.light') };

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

        <CaptureChoices onSelected={onSelected} />

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
