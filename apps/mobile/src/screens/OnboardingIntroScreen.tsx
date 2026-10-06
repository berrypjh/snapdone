import { StyleSheet, Text } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import type { AuthController } from '../auth/controller';
import { AuthShell } from '../components/auth/AuthShell';
import { LogoutButton } from '../components/auth/LogoutButton';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import { textStyle } from '../theme/text';

/** 지금 처리하는 영수증 · 외국어만 들고, 실행하지 않는 일은 약속하지 않는다. web 소개와 같은 예시다. */
const EXAMPLES = [
  {
    source: '영수증',
    detail: '12,000원',
    result: '금액 · 가게 확인',
    spokenResult: '금액과 가게 확인',
  },
  {
    source: '외국어 안내문',
    detail: 'Exit only',
    result: '번역할 문장 확인',
    spokenResult: '번역할 문장 확인',
  },
] as const;

type OnboardingIntroScreenProps = { controller: AuthController; onStart: () => void };

/**
 * 이 화면을 봤다고 온보딩을 완료 처리하거나 Home으로 보내지 않는다.
 */
export const OnboardingIntroScreen = ({ controller, onStart }: OnboardingIntroScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const done = { color: getColor(theme, 'text.success') };

  return (
    <AuthShell>
      <Stack gap="xl">
        <OnboardingTitle>사진 한 장으로{'\n'}필요한 정보를 찾아 드립니다.</OnboardingTitle>

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

        <Button variant="contained" size="lg" fullWidth onPress={onStart}>
          시작하기
        </Button>

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
