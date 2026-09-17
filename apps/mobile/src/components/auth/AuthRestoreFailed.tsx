import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import type { AuthErrorCode } from '../../auth/model';
import { textStyle } from '../../theme/text';

import { restoreFailedMessage } from './authCopy';
import { AuthShell } from './AuthShell';

type AuthRestoreFailedProps = {
  error: AuthErrorCode;
  onRetry: () => void;
};

/** 저장된 로그인을 확인하지 못했다. credential을 지우지 않고 다시 확인하게 한다. */
export const AuthRestoreFailed = ({ error, onRetry }: AuthRestoreFailedProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const message = restoreFailedMessage(error);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <AuthShell>
      <Stack gap="xl" align="center">
        <Text
          accessibilityRole="header"
          style={[
            textStyle(typography.body.mediumStrong),
            { color: getColor(theme, 'text.default') },
            styles.center,
          ]}
        >
          로그인 정보를 확인하지 못했습니다
        </Text>
        <Text
          style={[
            textStyle(typography.paragraph.default),
            { color: getColor(theme, 'text.light') },
            styles.center,
          ]}
        >
          {message}
        </Text>
        <Button variant="contained" size="lg" fullWidth onPress={onRetry}>
          다시 시도
        </Button>
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
