import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Box, Button, Divider, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { type AuthController, useAuthSnapshot } from '../auth/controller';
import type { AuthProvider } from '../auth/model';
import {
  authErrorMessage,
  PROVIDER_NAME,
  PROVIDER_ORDER,
  unavailableMessage,
} from '../components/auth/authCopy';
import { AuthShell } from '../components/auth/AuthShell';
import { ProviderButton } from '../components/auth/ProviderButton';
import type { LegalLinks } from '../lib/legal';
import { textStyle } from '../theme/text';

type AuthScreenProps = {
  controller: AuthController;
  legalLinks: LegalLinks | null;
  onOpenLegal: (url: string) => void;
};

const WORDMARK = '이미지 액션 라우터';
const CONSENT = '로그인하면 이용약관 및 개인정보처리방침에 동의하는 것으로 간주합니다.';

export const AuthScreen = ({ controller, legalLinks, onOpenLegal }: AuthScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const { auth, capabilities } = useAuthSnapshot(controller);
  const titleRef = useRef<View>(null);

  const submittingProvider = auth.status === 'submitting' ? auth.provider : null;
  const error = auth.status === 'recoverable-error' ? authErrorMessage(auth.error) : null;
  const unavailable =
    capabilities.status === 'loading'
      ? []
      : PROVIDER_ORDER.filter((provider) => controller.availability(provider) === 'unavailable');
  const capabilityError =
    capabilities.status === 'failed' ? authErrorMessage(capabilities.error) : null;

  useEffect(() => {
    if (titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
  }, []);

  useEffect(() => {
    if (submittingProvider) {
      AccessibilityInfo.announceForAccessibility(
        `${PROVIDER_NAME[submittingProvider]}로 로그인하는 중입니다`,
      );
    }
  }, [submittingProvider]);

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const muted = { color: getColor(theme, 'text.light') };
  const onPress = (provider: AuthProvider) => void controller.signIn(provider);

  return (
    <AuthShell>
      <Stack gap="3xl">
        <Stack gap="md" align="center">
          <View ref={titleRef} accessible accessibilityRole="header">
            <Text style={[textStyle(typography.body.mediumStrong), muted, styles.center]}>
              {WORDMARK}
            </Text>
            <Text
              style={[
                textStyle(typography.heading.h2),
                { color: getColor(theme, 'text.default') },
                styles.center,
              ]}
            >
              사진에서 행동까지.
            </Text>
          </View>
          <Text style={[textStyle(typography.paragraph.default), muted, styles.center]}>
            찍거나 올리면 AI가 알아서 처리합니다.
          </Text>
        </Stack>

        <Stack gap="md">
          {PROVIDER_ORDER.map((provider) => (
            <ProviderButton
              key={provider}
              provider={provider}
              availability={controller.availability(provider)}
              loading={submittingProvider === provider}
              busy={submittingProvider !== null}
              onPress={onPress}
            />
          ))}
          {submittingProvider && (
            <Button variant="text" onPress={controller.cancel}>
              취소
            </Button>
          )}
        </Stack>

        {(error || capabilityError || unavailable.length > 0) && (
          <Box p="lg" radius="md" bg="background.grey">
            <Stack gap="sm">
              {error && (
                <Text
                  style={[
                    textStyle(typography.paragraph.small),
                    { color: getColor(theme, 'text.error') },
                  ]}
                >
                  {error}
                </Text>
              )}
              {capabilityError ? (
                <>
                  <Text style={[textStyle(typography.paragraph.small), muted]}>
                    {capabilityError}
                  </Text>
                  <Button
                    variant="outlined"
                    size="sm"
                    onPress={() => void controller.reloadCapabilities()}
                  >
                    다시 시도
                  </Button>
                </>
              ) : (
                unavailable.length > 0 && (
                  <Text style={[textStyle(typography.paragraph.small), muted]}>
                    {unavailableMessage(unavailable)}
                  </Text>
                )
              )}
            </Stack>
          </Box>
        )}

        <Stack gap="sm">
          <Divider />
          <Text style={[textStyle(typography.caption.default), muted, styles.center]}>
            {CONSENT}
          </Text>
          {legalLinks && (
            <Stack direction="row" justify="center" gap="sm" wrap>
              <Button variant="text" size="sm" onPress={() => onOpenLegal(legalLinks.terms)}>
                이용약관
              </Button>
              <Button variant="text" size="sm" onPress={() => onOpenLegal(legalLinks.privacy)}>
                개인정보처리방침
              </Button>
            </Stack>
          )}
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
