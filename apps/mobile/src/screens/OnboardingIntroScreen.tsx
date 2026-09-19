import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import type { AuthController } from '../auth/controller';
import { AuthShell } from '../components/auth/AuthShell';
import { LogoutButton } from '../components/auth/LogoutButton';
import { textStyle } from '../theme/text';

const EXAMPLES = [
  {
    source: '영수증',
    detail: '6,500원',
    result: '지출 기록 완료',
    spokenResult: '지출 기록 완료',
  },
  {
    source: '공연 포스터',
    detail: '8월 25일',
    result: '캘린더 등록',
    spokenResult: '캘린더 등록 완료',
  },
  {
    source: '맛집 캡처',
    detail: '성수 ○○카페',
    result: '서울 맛집 저장',
    spokenResult: '서울 맛집 저장 완료',
  },
] as const;

/**
 * ON-02 서비스 소개. 다음 단계(ON-03)가 없어 시작하기는 준비 중이다.
 * 이 화면을 봤다고 온보딩을 완료 처리하거나 Home으로 보내지 않는다.
 */
export const OnboardingIntroScreen = ({ controller }: { controller: AuthController }) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const titleRef = useRef<Text>(null);
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const done = { color: getColor(theme, 'text.success') };

  useEffect(() => {
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, []);

  return (
    <AuthShell>
      <Stack gap="xl">
        <Text
          ref={titleRef}
          accessibilityRole="header"
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.heading.h3), text, styles.center]}
        >
          사진 한 장으로{'\n'}해야 할 일을 끝내세요.
        </Text>

        <Stack gap="md">
          {EXAMPLES.map((example) => (
            <Box
              key={example.source}
              accessible
              accessibilityLabel={`${example.source}, ${example.detail}, ${example.spokenResult}`}
              p="lg"
              radius="lg"
              bg="background.surface"
              style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
            >
              <Text style={[textStyle(typography.caption.default), muted, styles.center]}>
                {example.source}
              </Text>
              <Text style={[textStyle(typography.body.medium), text, styles.center]}>
                {example.detail}
              </Text>
              <Text style={[textStyle(typography.caption.default), muted, styles.center]}>↓</Text>
              <Text
                lineBreakStrategyIOS="hangul-word"
                style={[textStyle(typography.body.largeStrong), text, styles.center]}
              >
                {example.result} <Text style={done}>✓</Text>
              </Text>
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
