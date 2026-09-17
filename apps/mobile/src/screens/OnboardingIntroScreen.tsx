import { StyleSheet, Text, View } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import type { AuthController } from '../auth/controller';
import { AuthShell } from '../components/auth/AuthShell';
import { LogoutButton } from '../components/auth/LogoutButton';
import { textStyle } from '../theme/text';

/** ON-02 원문 예시. 입력 → 끝난 일. */
const EXAMPLES = [
  { source: '영수증', detail: '6,500원', result: '지출 기록 완료' },
  { source: '공연 포스터', detail: '8월 25일', result: '캘린더 등록' },
  { source: '맛집 캡처', detail: '성수 ○○카페', result: '서울 맛집 저장' },
] as const;

/**
 * ON-02 서비스 소개. 다음 단계(ON-03)가 없어 시작하기는 준비 중이다.
 * 이 화면을 봤다고 온보딩을 완료 처리하거나 Home으로 보내지 않는다.
 */
export const OnboardingIntroScreen = ({ controller }: { controller: AuthController }) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };

  return (
    <AuthShell>
      <Stack gap="2xl">
        <Text
          accessibilityRole="header"
          style={[textStyle(typography.heading.h2), text, styles.center]}
        >
          사진 한 장으로{'\n'}해야 할 일을 끝내세요.
        </Text>

        <Stack gap="md">
          {EXAMPLES.map((example) => (
            <Box
              key={example.source}
              p="lg"
              radius="lg"
              bg="background.surface"
              style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
            >
              <View
                accessible
                accessibilityLabel={`${example.source} ${example.detail}, ${example.result}`}
              >
                <Text style={[textStyle(typography.caption.default), muted, styles.center]}>
                  {example.source}
                </Text>
                <Text style={[textStyle(typography.body.mediumStrong), text, styles.center]}>
                  {example.detail}
                </Text>
                <Text style={[textStyle(typography.caption.default), muted, styles.center]}>↓</Text>
                <Text style={[textStyle(typography.paragraph.default), text, styles.center]}>
                  {example.result} ✓
                </Text>
              </View>
            </Box>
          ))}
        </Stack>

        <Stack gap="sm">
          <Button
            variant="contained"
            size="lg"
            fullWidth
            disabled
            accessibilityHint="준비 중입니다"
          >
            시작하기
          </Button>
          <Text style={[textStyle(typography.caption.default), muted, styles.center]}>
            다음 단계는 준비 중입니다.
          </Text>
        </Stack>

        <Stack align="center">
          <LogoutButton controller={controller} />
        </Stack>
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: {
    textAlign: 'center',
  },
});
