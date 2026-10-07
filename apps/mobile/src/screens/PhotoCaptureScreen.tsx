import { StyleSheet, Text } from 'react-native';

import { getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { AppShell } from '../components/AppShell';
import { CaptureChoices } from '../components/capture/CaptureChoices';
import { CAPTURE_NOTE, CAPTURE_TITLE } from '../components/processing/resultCopy';
import type { SelectedImage } from '../onboarding/capture';
import { textStyle } from '../theme/text';

type PhotoCaptureScreenProps = { onSelected: (image: SelectedImage) => void };

/**
 * 홈의 사진 추가. 사진에서 선택하거나 카메라로 촬영해 한 장을 받는다. 온보딩 첫 사진과 같은 선택 규칙이다.
 * 사진은 다음 화면으로만 넘기고 저장하지 않는다.
 */
export const PhotoCaptureScreen = ({ onSelected }: PhotoCaptureScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;

  return (
    <AppShell>
      <Stack gap="sm">
        <Text
          accessibilityRole="header"
          lineBreakStrategyIOS="hangul-word"
          style={[
            textStyle(typography.heading.h4),
            { color: getColor(theme, 'text.default') },
            styles.center,
          ]}
        >
          {CAPTURE_TITLE}
        </Text>
        <Text
          lineBreakStrategyIOS="hangul-word"
          style={[
            textStyle(typography.paragraph.default),
            { color: getColor(theme, 'text.light') },
            styles.center,
          ]}
        >
          {CAPTURE_NOTE}
        </Text>
      </Stack>
      <CaptureChoices onSelected={onSelected} />
    </AppShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
